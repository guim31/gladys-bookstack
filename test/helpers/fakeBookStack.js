// -----------------------------------------------------------------------------
// A fake BookStack behind a `fetch` function: it starts from the bodies
// recorded on a real BookStack v26.09.2 (test/fixtures/bookstack/v26.09.2/),
// keeps its books and pages in memory, and answers the errors the real server
// answers (JSON 401, 403, 404 and 422, an HTML 404 for an unknown route).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const HOST = 'http://192.0.2.50:6875';
export const TOKEN_ID = 'tokenid0000000000000000000000000';
export const TOKEN_SECRET = 'secret0000000000000000000000000';
export const INSTANCE = '5a1e0c3f-0000-4000-8000-000000000001';
// 07:00 UTC on the day the fixtures were recorded (06:52 UTC): their pages
// count as changed today in any time zone from UTC-12 to UTC+14.
export const NOW = Date.parse('2026-10-30T07:00:00.000Z');

export const fixture = (name) =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/bookstack/v26.09.2/${name}.json`, import.meta.url), 'utf8'),
  );

export const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const stampOf = (time) => new Date(time).toISOString().replace(/\.\d{3}Z$/, '.000000Z');
const parseFilterDate = (text) => Date.parse(/T/.test(text) ? text : `${text.replace(' ', 'T')}Z`);

const slugify = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function createBookStack() {
  const listed = fixture('pages-recent').body.data;
  const full = {
    5: fixture('page-markdown').body,
    7: fixture('page-wysiwyg').body,
  };
  const state = {
    system: fixture('system').body,
    books: structuredClone(fixture('books').body.data),
    shelves: 1,
    // Full pages: the listed fields, plus tags, content and authors.
    pages: listed.map((page) => ({
      ...structuredClone(page),
      tags: structuredClone(full[page.id]?.tags ?? []),
      markdown: full[page.id]?.markdown ?? '',
      html: full[page.id]?.html ?? '',
      updated_by_name: 'Admin',
    })),
    noApi: false,
    noSystem: false,
    readOnly: false,
    down: false,
    html: false,
    requests: [],
    clock: Date.parse('2026-10-30T06:53:00.000Z'),
  };
  const answer = (status, body, type = 'application/json') =>
    new Response(type === 'application/json' ? JSON.stringify(body) : body, {
      status,
      headers: { 'content-type': type },
    });
  const nextId = () => Math.max(0, ...state.pages.map((p) => p.id), 7) + 1;
  const bookById = (id) => state.books.find((b) => b.id === id);
  const tick = () => {
    state.clock += 60_000;
    return stampOf(state.clock);
  };
  const listItem = (page) => {
    const item = structuredClone(page);
    delete item.tags;
    delete item.markdown;
    delete item.html;
    delete item.updated_by_name;
    return item;
  };
  const fullPage = (page) => ({
    ...listItem(page),
    type: 'page',
    page_id: page.id,
    created_by: { id: 1, name: 'Admin', slug: 'admin' },
    updated_by: { id: 1, name: page.updated_by_name, slug: slugify(page.updated_by_name) },
    owned_by: { id: 1, name: 'Admin', slug: 'admin' },
    markdown: page.markdown,
    // `html` is rendered (includes resolved), `raw_html` is stored.
    html: page.rendered ?? page.html,
    raw_html: page.html,
    tags: page.tags,
  });

  /** A page created or saved by a user in BookStack. */
  function addPage({ name = 'New page', bookId = 1, tags = [], by = 'Admin', markdown = '' } = {}) {
    const at = tick();
    const book = bookById(bookId);
    const page = {
      name,
      id: nextId(),
      slug: slugify(name),
      book_id: bookId,
      chapter_id: null,
      draft: false,
      template: false,
      created_at: at,
      updated_at: at,
      priority: 1,
      owned_by: 1,
      book_slug: book.slug,
      created_by: 1,
      updated_by: 1,
      revision_count: 1,
      editor: 'markdown',
      tags: tags.map((tag, order) =>
        typeof tag === 'string' ? { name: tag, value: '', order } : { ...tag, order },
      ),
      markdown,
      html: `<p>${markdown}</p>`,
      updated_by_name: by,
    };
    state.pages.push(page);
    return page;
  }

  function editPage(id, { by = 'Admin', markdown } = {}) {
    const page = state.pages.find((p) => p.id === id);
    page.updated_at = tick();
    page.revision_count += 1;
    page.updated_by_name = by;
    if (markdown !== undefined) {
      page.markdown = markdown;
    }
    return page;
  }

  function list(searchParams) {
    let pages = [...state.pages];
    for (const [key, value] of searchParams) {
      const match = key.match(/^filter\[([a-z_]+)(?::([a-z]+))?\]$/);
      if (!match) {
        continue;
      }
      const [, field, op = 'eq'] = match;
      if (field === 'updated_at' && op === 'gte') {
        pages = pages.filter((p) => Date.parse(p.updated_at) >= parseFilterDate(value));
      } else if (field === 'book_id') {
        pages = pages.filter((p) => p.book_id === Number(value));
      } else if (field === 'name') {
        // MySQL compares case-insensitively.
        pages = pages.filter((p) => p.name.toLowerCase() === value.toLowerCase());
      } else {
        throw new Error(`fake BookStack: no filter ${key}`);
      }
    }
    const sort = searchParams.get('sort') ?? 'id';
    const field = sort.replace(/^[-+]/, '');
    const direction = sort.startsWith('-') ? -1 : 1;
    pages.sort((a, b) =>
      a[field] < b[field] ? -direction : a[field] > b[field] ? direction : a.id - b.id,
    );
    const count = Math.min(Number(searchParams.get('count') ?? 100), 500);
    const offset = Number(searchParams.get('offset') ?? 0);
    return { data: pages.slice(offset, offset + count).map(listItem), total: pages.length };
  }

  async function fetch(url, init = {}) {
    const { pathname, searchParams } = new URL(url);
    const path = pathname.replace(/^\/api/, '');
    const method = init.method ?? 'GET';
    state.requests.push(`${method} ${path}${searchParams.size ? `?${searchParams}` : ''}`);
    if (state.down) {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    }
    if (state.html) {
      return answer(200, '<html>Login</html>', 'text/html');
    }
    const authorization = init.headers?.Authorization;
    if (!authorization) {
      return answer(401, fixture('token-format').body);
    }
    if (authorization !== `Token ${TOKEN_ID}:${TOKEN_SECRET}`) {
      return answer(401, fixture('bad-token').body);
    }
    if (state.noApi) {
      return answer(403, fixture('no-api-permission').body);
    }
    const body = init.body ? JSON.parse(init.body) : undefined;
    const id = Number(path.split('/')[2]);

    if (method === 'GET' && path === '/system' && !state.noSystem) {
      return answer(200, state.system);
    }
    if (method === 'GET' && path === '/books') {
      const count = Math.min(Number(searchParams.get('count') ?? 100), 500);
      const offset = Number(searchParams.get('offset') ?? 0);
      return answer(200, {
        data: state.books.slice(offset, offset + count),
        total: state.books.length,
      });
    }
    if (method === 'GET' && path === '/shelves') {
      return answer(200, { data: [], total: state.shelves });
    }
    if (method === 'GET' && path === '/pages') {
      return answer(200, list(searchParams));
    }
    if (method === 'GET' && /^\/pages\/\d+$/.test(path)) {
      const page = state.pages.find((p) => p.id === id);
      return page ? answer(200, fullPage(page)) : answer(404, fixture('page-not-found').body);
    }
    if (method === 'POST' && path === '/pages') {
      if (state.readOnly) {
        return answer(403, fixture('page-create-forbidden').body);
      }
      if (!body.name || (body.markdown === undefined && body.html === undefined)) {
        return answer(422, fixture('page-create-invalid').body);
      }
      if (!bookById(body.book_id)) {
        return answer(404, { error: { message: 'Book not found.', code: 404 } });
      }
      const page = addPage({
        name: body.name,
        bookId: body.book_id,
        tags: body.tags ?? [],
        markdown: body.markdown ?? '',
      });
      if (body.markdown === undefined) {
        page.editor = 'wysiwyg';
        page.markdown = '';
        page.html = body.html;
      }
      return answer(200, fullPage(page));
    }
    if (method === 'PUT' && /^\/pages\/\d+$/.test(path)) {
      if (state.readOnly) {
        return answer(403, fixture('page-create-forbidden').body);
      }
      const page = state.pages.find((p) => p.id === id);
      if (!page) {
        return answer(404, fixture('page-not-found').body);
      }
      editPage(id);
      if (body.markdown !== undefined) {
        page.markdown = body.markdown;
        page.editor = 'markdown';
      }
      if (body.html !== undefined) {
        page.html = body.html;
      }
      return answer(200, fullPage(page));
    }
    return answer(404, '<!DOCTYPE html><html><body>Not Found</body></html>', 'text/html');
  }

  return {
    state,
    fetch,
    addPage,
    editPage,
    remove(id) {
      state.pages = state.pages.filter((p) => p.id !== id);
    },
    goDown() {
      state.down = true;
    },
    goUp() {
      state.down = false;
    },
  };
}
