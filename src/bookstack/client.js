// -----------------------------------------------------------------------------
// The REST API of BookStack (`<base>/api/...`), the few calls the integration
// needs, authenticated by an API token (`Authorization: Token <id>:<secret>`).
//
// Facts checked on a real server, BookStack v26.09.2
// (lscr.io/linuxserver/bookstack), see test/fixtures/bookstack/v26.09.2/:
// - lists are `{ data, total }`, `count` (500 at most) and `offset` page them,
//   `sort=-updated_at` orders them, `filter[updated_at:gte]=<date>` filters
//   them (the date in UTC, ISO or `Y-m-d H:i:s`); `total` honours the filter;
// - the list of pages carries neither tags nor content: `GET /pages/{id}` does
//   (`tags`, `editor`, `markdown`, `html`, `updated_by: { name }`);
// - errors are `{ error: { message, code } }`: 401 without or with a wrong
//   token, 403 when the owner of the token lacks the "Access system API"
//   permission or the permission the request needs, 404, 422 with
//   `validation`; an unknown route is an HTML 404 page;
// - `GET /system` (`instance_id`, `version`) exists on recent versions only;
// - 180 requests per minute per user by default (`X-RateLimit-Limit`).
// -----------------------------------------------------------------------------

export const DEFAULT_TIMEOUT = 15_000;
export const PAGE_SIZE = 500;

export class BookStackError extends Error {
  /**
   * @param {'unreachable' | 'unauthorized' | 'no_api' | 'forbidden' | 'not_found' | 'timeout' | 'http' | 'invalid' | 'rejected' | 'rate_limited'} kind
   * @param {string} message never carries a credential
   * @param {number} [status]
   */
  constructor(kind, message, status) {
    super(message);
    this.name = 'BookStackError';
    this.kind = kind;
    this.status = status;
  }
}

/** A BookStack date as sent in a filter: UTC, `Y-m-d H:i:s`. */
export const filterDate = (time) => new Date(time).toISOString().slice(0, 19).replace('T', ' ');

export class BookStackClient {
  /**
   * @param {object} options
   * @param {string} options.url normalized base URL (see normalizeUrl)
   * @param {string} options.tokenId
   * @param {string} options.tokenSecret
   * @param {typeof fetch} [options.fetch]
   * @param {number} [options.timeout]
   */
  constructor({ url, tokenId, tokenSecret, fetch: fetchImpl, timeout }) {
    this.url = url;
    this.authorization = `Token ${tokenId}:${tokenSecret}`;
    this.fetch = fetchImpl ?? globalThis.fetch;
    this.timeout = timeout ?? DEFAULT_TIMEOUT;
  }

  async #send(method, path, body) {
    const headers = { Accept: 'application/json', Authorization: this.authorization };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    let response;
    let raw;
    try {
      response = await this.fetch(`${this.url}/api${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeout),
        redirect: 'follow',
      });
      raw = await response.text();
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new BookStackError('timeout', `No answer from BookStack within ${this.timeout} ms`);
      }
      const cause = err?.cause?.code ?? err?.cause?.message ?? err?.message ?? 'error';
      throw new BookStackError('unreachable', `BookStack unreachable (${cause})`);
    }
    if (!response.ok) {
      throw BookStackClient.#fail(path, response.status, raw);
    }
    try {
      return JSON.parse(raw);
    } catch {
      // A proxy login page answering 200 in HTML, for instance.
      throw new BookStackError('invalid', `${path}: the answer is not JSON (is this BookStack?)`);
    }
  }

  static #fail(path, status, raw) {
    let detail = raw.trim() || `HTTP ${status}`;
    let validation = null;
    let json = false;
    try {
      const data = JSON.parse(raw);
      json = true;
      if (typeof data?.error?.message === 'string') {
        detail = data.error.message;
      }
      validation = data?.error?.validation ?? null;
    } catch {
      // not JSON
    }
    if (/^\s*</.test(detail)) {
      detail = `HTTP ${status}`;
    }
    if (validation && typeof validation === 'object') {
      const first = Object.values(validation)
        .flat()
        .find((m) => typeof m === 'string');
      if (first) {
        detail = first;
      }
    }
    let kind = 'http';
    if (status === 401) {
      kind = 'unauthorized';
    } else if (status === 403) {
      // The token is fine but its owner may not use the API at all, or may not
      // do this one thing (create a page in that book...).
      kind = /make API calls/i.test(detail) ? 'no_api' : 'forbidden';
    } else if (status === 404) {
      // An HTML 404 is a wrong address; a JSON one, a missing item.
      kind = json ? 'not_found' : 'invalid';
    } else if (status === 422 || status === 400) {
      kind = 'rejected';
    } else if (status === 429) {
      kind = 'rate_limited';
    }
    return new BookStackError(
      kind,
      `${path.split('?')[0]}: ${detail.replace(/\s+/g, ' ').slice(0, 120)}`,
      status,
    );
  }

  static #list(data, what) {
    if (!Array.isArray(data?.data) || !Number.isInteger(data.total)) {
      throw new BookStackError('invalid', `BookStack did not answer its ${what}`);
    }
    return data;
  }

  /**
   * `{ instance_id, version, ... }`, or null on a BookStack older than this
   * endpoint (a JSON 404 or an HTML one: the other calls tell the two apart).
   */
  async system() {
    try {
      const data = await this.#send('GET', '/system');
      return data && typeof data === 'object' ? data : null;
    } catch (err) {
      if (err instanceof BookStackError && (err.kind === 'not_found' || err.kind === 'invalid')) {
        return null;
      }
      throw err;
    }
  }

  /** The total of a list (`books`, `shelves`, `pages`), filters applied. */
  async count(kind, filters = {}) {
    const params = new URLSearchParams({ count: '1' });
    for (const [key, value] of Object.entries(filters)) {
      params.set(`filter[${key}]`, String(value));
    }
    return BookStackClient.#list(await this.#send('GET', `/${kind}?${params}`), kind).total;
  }

  /** Every book the user can see, up to `max`. */
  async books(max = 2000) {
    const found = [];
    for (let offset = 0; offset < max; offset += PAGE_SIZE) {
      const params = new URLSearchParams({
        count: String(PAGE_SIZE),
        offset: String(offset),
        sort: 'id',
      });
      const page = BookStackClient.#list(await this.#send('GET', `/books?${params}`), 'books');
      found.push(...page.data);
      if (page.data.length < PAGE_SIZE || found.length >= page.total) {
        break;
      }
    }
    return found.slice(0, max);
  }

  /**
   * Pages, newest change first by default.
   * @param {{ count?: number, sort?: string, filters?: Record<string, string | number> }} [query]
   * @returns {Promise<{ data: object[], total: number }>}
   */
  async pages({ count = 20, sort = '-updated_at', filters = {} } = {}) {
    const params = new URLSearchParams({ count: String(count), sort });
    for (const [key, value] of Object.entries(filters)) {
      params.set(`filter[${key}]`, String(value));
    }
    return BookStackClient.#list(await this.#send('GET', `/pages?${params}`), 'pages');
  }

  /** One page with its tags, editor and content. */
  async page(id) {
    const data = await this.#send('GET', `/pages/${encodeURIComponent(id)}`);
    if (!Number.isInteger(data?.id)) {
      throw new BookStackError('invalid', 'BookStack did not answer the page');
    }
    return data;
  }

  /**
   * @param {{ bookId: number, name: string, markdown?: string, html?: string, tags?: { name: string, value?: string }[] }} page
   */
  async createPage({ bookId, name, markdown, html, tags = [] }) {
    const body = { book_id: bookId, name };
    if (markdown !== undefined) {
      body.markdown = markdown;
    } else {
      body.html = html ?? '<p></p>';
    }
    if (tags.length > 0) {
      body.tags = tags;
    }
    const data = await this.#send('POST', '/pages', body);
    if (!Number.isInteger(data?.id)) {
      throw new BookStackError('invalid', 'BookStack did not answer the new page');
    }
    return data;
  }

  /** @param {number} id @param {{ markdown?: string, html?: string }} content */
  async updatePage(id, content) {
    const data = await this.#send('PUT', `/pages/${encodeURIComponent(id)}`, content);
    if (!Number.isInteger(data?.id)) {
      throw new BookStackError('invalid', 'BookStack did not answer the page');
    }
    return data;
  }
}
