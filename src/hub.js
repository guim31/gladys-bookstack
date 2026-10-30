// -----------------------------------------------------------------------------
// The hub: the link to one BookStack instance and everything Gladys sees of
// it — the devices, their states, the connection status, the scene events,
// and the pages written from scenes.
//
// BookStack pushes nothing: the container reads it every `refresh_minutes`
// (15 by default) on its own timer (should_poll: false), and just after
// midnight so that "pages changed today" falls back to 0. A read is a handful
// of requests: the instance (once), the books, three totals (shelves, pages,
// pages changed today), the newest changed pages, then one total per book
// added to Gladys and one page read per change announced.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  MAX_BOOKS,
  bookIds,
  bookstackIds,
  buildBookDevice,
  buildBookStackDevice,
  buildBookStackStates,
  buildBookStates,
  instanceId,
  parseExternalId,
} from './devices.js';
import { BookStackClient, BookStackError, filterDate } from './bookstack/client.js';
import {
  appendLine,
  findBook,
  parseTags,
  stamp,
  summarizeBook,
  summarizePage,
  tagNames,
  tagText,
} from './bookstack/model.js';
import { MemoryStore } from './store.js';
import { STATUS_TEXT, TEST_TEXT, commandMessage } from './texts.js';

const logger = createLogger({ name: 'bookstack-hub' });

export const WIDGET_KEY = 'pages';
export const TRIGGERS = { changed: 'page_changed', tagged: 'tagged_page_changed' };

export const DEFAULT_TIMINGS = {
  // requestWidgetRefresh is dropped by the core beyond one call per 10 s.
  widgetGap: 10_500,
  // An unchanged value is sent again before Gladys calls it stale (48 h).
  heartbeat: 6 * 3_600_000,
  requestTimeout: 15_000,
  // How long the pages of one book, read for a widget, are reused.
  widgetCache: 60_000,
  // The read after midnight waits a little for the clock to be past it.
  midnightDelay: 5_000,
};

export const LATEST_COUNT = 20;
// The changed pages read at once, the oldest first: past that many changes
// between two reads (an import, a book moved), it is a burst — ten are
// announced and the rest is recorded as seen without firing.
export const CHANGES_PAGE = 50;
// Each announced change costs one more request (its tags): bounded per read.
// Below a burst, the changes past ten wait for the next read, never lost.
export const MAX_EVENTS_PER_READ = 10;
// The pages written by the integration itself are never announced (a scene
// bound to "Page changed" that writes a page would loop).
const MAX_OWN = 200;
// Reads after which a change whose event Gladys keeps refusing is given up.
export const MAX_TRIES = 3;

/** An Error carrying a coded, multi-language message. */
export class CommandError extends Error {
  constructor(code, language, values) {
    const messages = commandMessage(code, values);
    super(messages[language] ?? messages.en);
    this.code = code;
    this.messages = messages;
  }
}

const linkOf = (config) => JSON.stringify([config.url, config.tokenId, config.tokenSecret]);
const timeOf = (iso) => Date.parse(iso);
const ownKey = (page) => `${page.id}@${timeOf(page.updated_at)}`;

/** Local midnight (the TZ of Gladys, injected by its supervisor) of a time. */
export function startOfDay(time) {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** The newest change seen: its time and the pages changed at that very second. */
function advance(mark, page) {
  const at = timeOf(page.updated_at);
  if (!mark || at > mark.at) {
    return { at, ids: [page.id] };
  }
  if (at === mark.at && !mark.ids.includes(page.id)) {
    return { at, ids: [...mark.ids, page.id] };
  }
  return mark;
}

const seenBy = (mark, page) => {
  const at = timeOf(page.updated_at);
  return at < mark.at || (at === mark.at && mark.ids.includes(page.id));
};

export class Hub {
  constructor({ gladys, fetch, timings, now = Date.now, store }) {
    this.gladys = gladys;
    this.fetch = fetch;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.now = now;
    this.store = store ?? new MemoryStore();
    this.config = {
      url: null,
      urlInvalid: false,
      tokenId: '',
      tokenSecret: '',
      refreshMinutes: 15,
      language: 'fr',
    };
    this.client = null;
    /** { id, version } */
    this.instance = null;
    /** [{ id, name, slug }] */
    this.books = [];
    this.booksById = new Map();
    /** book id -> number of pages (books added to Gladys only) */
    this.bookPages = new Map();
    /** { books, shelves, pages, today } */
    this.counters = null;
    /** the pages changed last, summarized */
    this.latest = [];
    /** null (fine), or the kind of the last failure */
    this.failure = null;
    this.announced = false;
    this.lastStatus = '';
    /** what the triggers already saw: { instance, at, ids } */
    this.seen = null;
    /** `<page id>@<time>` of the changes written by the integration */
    this.own = new Set();
    /** `<page id>@<time>` -> { tries, sent }: failed reads, events Gladys took */
    this.retries = new Map();
    this.eventFailing = false;
    this.devicesFailing = false;
    this.publishFailing = false;
    this.widgetLists = new Map();
    this.configuring = Promise.resolve();
    this.writing = Promise.resolve();
    this.refreshTimer = null;
    this.midnightTimer = null;
    this.refreshing = null;
    this.refreshAgain = false;
    this.widgetRefreshAt = 0;
    this.widgetTimer = null;
    this.stopped = false;
  }

  get language() {
    return this.config.language;
  }

  get loaded() {
    return this.counters !== null;
  }

  async start(config) {
    const saved = await this.store.load();
    // A damaged file is a new baseline, not a crash on every read.
    this.seen =
      typeof saved.instance === 'string' &&
      Number.isFinite(saved.at) &&
      Array.isArray(saved.ids) &&
      saved.ids.every(Number.isInteger)
        ? { instance: saved.instance, at: saved.at, ids: saved.ids }
        : null;
    // The pages written from Gladys but not read back yet: never announced,
    // even after a restart.
    if (Array.isArray(saved.own)) {
      this.own = new Set(saved.own.filter((k) => typeof k === 'string').slice(-MAX_OWN));
    }
    this.#scheduleMidnight();
    await this.reconfigure(config);
  }

  /** One configuration change at a time: a second one waits for the first. */
  reconfigure(config) {
    const run = this.configuring.then(() => this.#reconfigure(config));
    this.configuring = run.catch(() => {});
    return run;
  }

  async #reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const linkChanged = linkOf(previous) !== linkOf(config) || !this.client;
    if (linkChanged || previous.refreshMinutes !== config.refreshMinutes) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (linkChanged) {
      this.client = null;
      this.instance = null;
      this.books = [];
      this.booksById = new Map();
      this.bookPages.clear();
      this.counters = null;
      this.latest = [];
      this.failure = null;
      this.announced = false;
      this.widgetLists.clear();
      if (config.url && config.tokenId && config.tokenSecret) {
        this.client = new BookStackClient({
          url: config.url,
          tokenId: config.tokenId,
          tokenSecret: config.tokenSecret,
          fetch: this.fetch,
          timeout: this.timings.requestTimeout,
        });
      }
    }
    if (this.client && !this.refreshTimer) {
      this.refreshTimer = setInterval(
        () => this.refresh().catch((err) => logger.error('Read failed', err)),
        config.refreshMinutes * 60_000,
      );
      this.refreshTimer.unref?.();
    }
    if (linkChanged) {
      await this.refresh();
    } else {
      // Language or interval only: same data, new names and texts.
      this.gladys.forgetPublishedStates?.();
      await this.#update();
    }
    await this.updateConnectionStatus();
  }

  /** Gladys reconnected (it may have restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.lastStatus = '';
    await this.reconfigure(config);
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.refreshTimer);
    clearTimeout(this.midnightTimer);
    clearTimeout(this.widgetTimer);
    this.refreshTimer = null;
    await this.store.flush();
  }

  /** A read just after local midnight: the count of the day starts again. */
  #scheduleMidnight() {
    if (this.stopped) {
      return;
    }
    const now = this.now();
    const tomorrow = new Date(startOfDay(now));
    tomorrow.setDate(tomorrow.getDate() + 1);
    const wait = tomorrow.getTime() - now + this.timings.midnightDelay;
    this.midnightTimer = setTimeout(() => {
      this.#scheduleMidnight();
      if (this.client) {
        this.refresh().catch((err) => logger.error('Read failed', err));
      }
    }, wait);
    this.midnightTimer.unref?.();
  }

  // --- Reading BookStack ----------------------------------------------------

  /** Read BookStack (one read at a time; a request during it runs once after). */
  refresh() {
    if (this.refreshing) {
      this.refreshAgain = true;
      return this.refreshing;
    }
    this.refreshing = (async () => {
      do {
        this.refreshAgain = false;
        try {
          await this.#refreshOnce();
        } catch (err) {
          // Never ends the loop: a read queued meanwhile (new address) still runs.
          logger.error('Read failed', err);
        }
      } while (this.refreshAgain && !this.stopped);
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  #known(instance) {
    return this.seen?.instance === instance ? this.seen : null;
  }

  async #refreshOnce() {
    const client = this.client;
    if (this.stopped) {
      return;
    }
    if (!client) {
      await this.publishDevices();
      return;
    }
    let instance;
    let books;
    let shelves;
    let pages;
    let today;
    let recent;
    let changes;
    try {
      if (this.instance) {
        instance = this.instance;
      } else {
        const system = await client.system();
        instance = { id: instanceId(system, this.config.url), version: system?.version ?? '' };
      }
      const known = this.#known(instance.id);
      [books, shelves, pages, today, recent, changes] = await Promise.all([
        client.books(),
        client.count('shelves'),
        client.count('pages'),
        client.count('pages', { 'updated_at:gte': filterDate(startOfDay(this.now())) }),
        client.pages({ count: LATEST_COUNT }),
        known
          ? client.pages({
              count: CHANGES_PAGE,
              sort: '+updated_at',
              filters: { 'updated_at:gte': filterDate(known.at) },
            })
          : null,
      ]);
      // The page totals of the books added to Gladys.
      const bookPages = new Map();
      for (const book of books.slice(0, MAX_BOOKS)) {
        if (this.#isCreated(bookIds(this.gladys, instance.id, book.id).device)) {
          bookPages.set(book.id, await client.count('pages', { book_id: book.id }));
        }
      }
      this.bookPages = bookPages;
    } catch (err) {
      if (client !== this.client) {
        return;
      }
      this.#fail(err);
      await this.updateConnectionStatus();
      return;
    }
    if (client !== this.client || this.stopped) {
      return;
    }
    this.instance = instance;
    this.books = books.map(summarizeBook).sort((a, b) => a.name.localeCompare(b.name));
    this.booksById = new Map(this.books.map((b) => [b.id, b]));
    this.counters = { books: books.length, shelves, pages, today };
    this.latest = recent.data.map((p) => summarizePage(p, this.booksById, this.config.url));
    this.widgetLists.clear();
    this.#recover();
    await this.#update();
    if (client !== this.client || this.stopped || !this.instance) {
      return; // the configuration changed meanwhile
    }
    await this.#announce(client, recent.data, changes ?? null);
    await this.updateConnectionStatus();
  }

  /** Devices, states and widget from the last read. */
  async #update() {
    await this.publishDevices();
    await this.publishStates();
    this.refreshWidget();
  }

  #fail(err) {
    const kind = err instanceof BookStackError ? err.kind : 'unreachable';
    if (this.failure === null) {
      logger.warn(`BookStack: ${err.message}`);
    } else {
      logger.debug(`BookStack still failing: ${err.message}`);
    }
    this.failure = kind;
  }

  #recover() {
    const count = this.counters.pages;
    if (this.failure !== null) {
      logger.info(`BookStack answers again (${count} pages)`);
    } else if (!this.announced) {
      const version = this.instance.version ? ` ${this.instance.version}` : '';
      logger.info(`Connected to BookStack${version} (${count} pages)`);
    }
    this.announced = true;
    this.failure = null;
  }

  // --- Scene events ---------------------------------------------------------

  /**
   * Fire the pages created or changed since the last read, the oldest first.
   * The first read of an instance is a silent baseline: installing the
   * integration announces nothing already there.
   * @param {BookStackClient} client
   * @param {object[]} recent the newest changed pages (baseline)
   * @param {{ data: object[], total: number } | null} changes the pages changed since the mark, oldest first
   */
  async #announce(client, recent, changes) {
    const instance = this.instance.id;
    const known = this.#known(instance);
    let mark = known ? { at: known.at, ids: known.ids } : null;
    if (!known || !changes) {
      // Baseline: the newest change of the wiki (an empty wiki: any page to come).
      mark = null;
      for (const page of recent) {
        mark = advance(mark, page);
      }
      mark ??= { at: 0, ids: [] };
    } else {
      const fresh = changes.data.filter((p) => !seenBy(known, p) && !this.own.has(ownKey(p)));
      const pending = fresh.slice(0, MAX_EVENTS_PER_READ);
      const burst = changes.total > CHANGES_PAGE;
      if (burst) {
        logger.info(`${changes.total} pages changed at once: ${pending.length} announced`);
      }
      // The oldest first; the mark follows each page Gladys took.
      let stopped = false;
      for (const page of changes.data) {
        if (this.own.has(ownKey(page)) || seenBy(known, page)) {
          mark = advance(mark, page);
          continue;
        }
        if (!pending.includes(page)) {
          break; // past ten: the next read
        }
        if ((await this.#fire(client, page, known.at)) === 'retry') {
          stopped = true;
          break;
        }
        mark = advance(mark, page);
      }
      if (burst && !stopped) {
        // The rest of a burst is seen: the mark jumps to the newest change.
        for (const page of recent) {
          mark = advance(mark, page);
        }
      }
    }
    for (const key of this.own) {
      if (Number(key.split('@')[1]) <= mark.at) {
        this.own.delete(key);
      }
    }
    const next = { instance, at: mark.at, ids: mark.ids, own: [...this.own] };
    if (JSON.stringify(next) !== JSON.stringify({ ...this.seen, own: next.own })) {
      this.seen = next;
      await this.store.save(next);
    }
  }

  /**
   * Fire the events of one changed page: one "Page changed", and one "Tagged
   * page changed" per tag name (so a scene set on a tag runs once).
   * @returns {Promise<'done' | 'retry'>}
   */
  async #fire(client, listed, since) {
    const key = ownKey(listed);
    const attempt = this.retries.get(key) ?? { tries: 0, sent: 0 };
    // A change that keeps failing, read after read, is given up: it would
    // hold back every later one.
    const again = (what) => {
      const tries = attempt.tries + 1;
      if (tries < MAX_TRIES) {
        this.retries.set(key, { ...attempt, tries });
        return 'retry';
      }
      logger.warn(`Page ${listed.id} not announced: ${what} ${tries} times`);
      this.retries.delete(key);
      return 'done';
    };
    let page;
    try {
      page = await client.page(listed.id);
    } catch (err) {
      if (err instanceof BookStackError && (err.kind === 'not_found' || err.kind === 'forbidden')) {
        this.retries.delete(key);
        return 'done'; // deleted or hidden meanwhile: nothing to announce
      }
      logger.debug(`Page ${listed.id} not read: ${err.message}`);
      return again('BookStack failed to read it');
    }
    const data = this.#eventData(page, listed, since);
    const events = [
      [TRIGGERS.changed, data],
      ...tagNames(page.tags).map((tag) => [TRIGGERS.tagged, { ...data, tag: tag.slice(0, 1000) }]),
    ];
    // The events Gladys already took for this change are not sent again.
    for (const [index, [trigger, eventData]] of events.entries()) {
      if (index < attempt.sent) {
        continue;
      }
      logger.debug(`${trigger}: ${page.id}`);
      try {
        await this.gladys.publishSceneEvent(trigger, eventData);
        if (this.eventFailing) {
          logger.info('Scene events accepted again');
        }
        this.eventFailing = false;
        attempt.sent = index + 1;
      } catch (err) {
        if (this.eventFailing) {
          logger.debug(`Cannot fire ${trigger}: ${err.message}`);
        } else {
          logger.warn(`Cannot fire ${trigger}: ${err.message}`);
        }
        this.eventFailing = true;
        // A refusal for good (4xx but 429) is not retried: it would be
        // refused at every read. Otherwise (Gladys restarting), this change
        // and the next ones are fired again at the next read.
        const status = err?.status;
        const final = Number.isInteger(status) && status >= 400 && status < 500 && status !== 429;
        if (final) {
          attempt.sent = index + 1;
          continue;
        }
        return again('Gladys refused it');
      }
    }
    this.retries.delete(key);
    return 'done';
  }

  #eventData(page, listed, since) {
    const created = timeOf(page.created_at ?? listed.created_at) > since;
    const summary = summarizePage({ ...listed, ...page }, this.booksById, this.config.url);
    const tags = (Array.isArray(page.tags) ? page.tags : []).map(tagText).filter(Boolean);
    return {
      // The book filter: the book device, as picked in the editor.
      book: bookIds(this.gladys, this.instance.id, summary.bookId).device,
      change: created ? 'created' : 'updated',
      page_name: summary.name.slice(0, 1000),
      book_name: summary.book.slice(0, 1000),
      url: summary.url.slice(0, 1000),
      updated_by: String(page.updated_by?.name ?? '').slice(0, 1000),
      tags: tags.join(', ').slice(0, 1000),
      page_id: page.id,
    };
  }

  // --- Devices and states ---------------------------------------------------

  #isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  buildDevices() {
    if (!this.instance || !this.counters) {
      return [];
    }
    return [
      buildBookStackDevice(this.gladys, this.instance, this.language, this.config.url ?? ''),
      ...this.books
        .slice(0, MAX_BOOKS)
        .map((b) => buildBookDevice(this.gladys, this.instance.id, b, this.language)),
    ];
  }

  async publishDevices() {
    if (this.stopped) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(this.buildDevices());
    } catch (err) {
      if (this.devicesFailing) {
        logger.debug(`Cannot publish the devices: ${err.message}`);
      } else {
        logger.warn(`Cannot publish the devices: ${err.message}`);
      }
      this.devicesFailing = true;
      return;
    }
    this.devicesFailing = false;
  }

  /**
   * The states of the devices the user added (Gladys drops the others).
   * @param {string} [justCreated] the external id of a device just added
   */
  async publishStates(justCreated) {
    if (!this.instance || !this.counters || this.stopped) {
      return;
    }
    const created = (id) => id === justCreated || this.#isCreated(id);
    const instance = this.instance.id;
    const states = [];
    if (created(bookstackIds(this.gladys, instance).device)) {
      states.push(
        ...buildBookStackStates(
          this.gladys,
          instance,
          this.counters,
          this.latest[0],
          this.language,
        ),
      );
    }
    for (const [bookId, pages] of this.bookPages) {
      if (created(bookIds(this.gladys, instance, bookId).device)) {
        states.push(...buildBookStates(this.gladys, instance, bookId, pages));
      }
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeat });
    } catch (err) {
      if (this.publishFailing) {
        logger.debug(`Cannot publish the states: ${err.message}`);
      } else {
        logger.warn(`Cannot publish the states: ${err.message}`);
      }
      this.publishFailing = true;
      return;
    }
    if (this.publishFailing) {
      logger.info('States published again');
    }
    this.publishFailing = false;
  }

  #ours(device) {
    const parsed = parseExternalId(this.gladys, device?.external_id);
    return parsed !== null && parsed.instance === this.instance?.id ? parsed : null;
  }

  /** The user added a device: states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    const parsed = this.#ours(device);
    if (!parsed) {
      return;
    }
    if (parsed.kind === 'book' && !this.bookPages.has(parsed.bookId) && this.client) {
      // A book device is counted from its addition on: count it now.
      try {
        const count = await this.client.count('pages', { book_id: parsed.bookId });
        this.bookPages.set(parsed.bookId, count);
      } catch (err) {
        logger.debug(`Book ${parsed.bookId} not counted: ${err.message}`);
      }
    }
    this.gladys.forgetPublishedStates?.(device.external_id);
    await this.publishStates(device.external_id);
    this.refreshWidget();
  }

  /** The user renamed or deleted a device: the widget shows Gladys names. */
  onDeviceChanged(device) {
    if (this.#ours(device)) {
      this.refreshWidget();
    }
  }

  /** onPoll (the devices are not polled: the container reads on its timer). */
  async poll(device) {
    if (this.#ours(device)) {
      await this.publishStates(device.external_id);
    }
  }

  // --- Widget ---------------------------------------------------------------

  /** Nudge the open dashboards, with a trailing call inside the core's 10 s gap. */
  refreshWidget() {
    if (this.stopped) {
      return;
    }
    const wait = this.widgetRefreshAt + this.timings.widgetGap - this.now();
    if (wait <= 0) {
      this.widgetRefreshAt = this.now();
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
      return;
    }
    if (!this.widgetTimer) {
      this.widgetTimer = setTimeout(() => {
        this.widgetTimer = null;
        this.refreshWidget();
      }, wait);
      this.widgetTimer.unref?.();
    }
  }

  /**
   * The book behind a book device external id, with the name given in
   * Gladys; undefined when it is not one of ours.
   */
  bookOf(externalId) {
    const parsed = parseExternalId(this.gladys, externalId);
    if (parsed?.kind !== 'book' || parsed.instance !== this.instance?.id) {
      return undefined;
    }
    const book = this.booksById.get(parsed.bookId);
    if (!book) {
      return undefined;
    }
    const device = (this.gladys.devices ?? []).find((d) => d.external_id === externalId);
    return { ...book, label: device?.name || book.name };
  }

  /**
   * The pages a widget shows: the last changed of all (from the last read)
   * or of one book (read on demand, reused a minute). Null when BookStack
   * cannot be read.
   * @param {{ id: number } | undefined} book
   */
  async widgetPages(book, count) {
    if (!this.loaded || this.failure !== null) {
      return null;
    }
    if (!book) {
      return this.latest.slice(0, count);
    }
    const cached = this.widgetLists.get(book.id);
    if (cached && this.now() - cached.at < this.timings.widgetCache) {
      return cached.pages.slice(0, count);
    }
    const client = this.client;
    try {
      const list = await client.pages({ count, filters: { book_id: book.id } });
      const pages = list.data.map((p) => summarizePage(p, this.booksById, this.config.url));
      if (client === this.client) {
        this.widgetLists.set(book.id, { at: this.now(), pages, total: list.total });
      }
      return pages.slice(0, count);
    } catch (err) {
      logger.debug(`Widget list not read: ${err.message}`);
      return null;
    }
  }

  // --- Connection status ----------------------------------------------------

  statusKey() {
    if (this.config.urlInvalid) {
      return 'invalid';
    }
    if (!this.config.url) {
      return 'none';
    }
    if (!this.config.tokenId || !this.config.tokenSecret) {
      return 'token';
    }
    if (this.failure) {
      return (
        {
          unauthorized: 'unauthorized',
          no_api: 'no_api',
          invalid: 'invalid_answer',
          not_found: 'invalid_answer',
          http: 'error',
          rejected: 'error',
          forbidden: 'error',
          rate_limited: 'error',
        }[this.failure] ?? 'unreachable'
      );
    }
    return null;
  }

  statusMessage() {
    const key = this.statusKey();
    return key ? this.#statusOf(key) : null;
  }

  #statusOf(key) {
    return Object.fromEntries(
      Object.entries(STATUS_TEXT).map(([language, table]) => [language, table[key]]),
    );
  }

  async updateConnectionStatus() {
    if (this.stopped) {
      return;
    }
    // Nothing to say before the first answer or failure.
    if (this.client && !this.loaded && this.failure === null) {
      return;
    }
    const message = this.statusMessage();
    const connected = Boolean(this.client) && this.loaded && this.failure === null;
    const fingerprint = JSON.stringify({ connected, message });
    if (fingerprint === this.lastStatus) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(connected, message ?? undefined);
      // Recorded once Gladys took it: a failed call is sent again next time.
      this.lastStatus = fingerprint;
    } catch (err) {
      logger.warn(`Cannot set the connection status: ${err.message}`);
    }
  }

  // --- Actions --------------------------------------------------------------

  /** "Test the connection": a fresh read, then its outcome. */
  async testReport() {
    if (!this.client) {
      return this.statusMessage();
    }
    await this.refresh();
    const message = this.statusMessage();
    if (message) {
      return message;
    }
    if (!this.loaded) {
      // The configuration changed during the test: nothing read yet.
      return this.#statusOf('unreachable');
    }
    return Object.fromEntries(
      Object.entries(TEST_TEXT).map(([language, render]) => [
        language,
        render(this.counters.books, this.counters.pages),
      ]),
    );
  }

  #clientOrFail() {
    if (!this.client) {
      throw new CommandError('unreachable', this.language);
    }
    return this.client;
  }

  /** A book typed by the user, looked up in a fresh list. */
  async #resolveBook(client, name) {
    const wanted = typeof name === 'string' || typeof name === 'number' ? String(name).trim() : '';
    if (wanted === '') {
      throw new CommandError('book_missing', this.language);
    }
    const found = findBook((await client.books()).map(summarizeBook), wanted);
    if (!found) {
      throw new CommandError('book', this.language, { name: wanted.slice(0, 100) });
    }
    return found;
  }

  /** Writes one at a time: two lines added at once both land in the page. */
  #serialize(fn) {
    const run = this.writing.then(fn);
    this.writing = run.catch(() => {});
    return run;
  }

  /**
   * Create a page in a book. An unknown book is an error, never created.
   * @param {{ book: unknown, name: unknown, content?: unknown, tags?: unknown }} request
   */
  createPage({ book, name, content, tags }) {
    return this.#serialize(async () => {
      const language = this.language;
      const title = typeof name === 'string' ? name.trim().slice(0, 255) : '';
      if (!title) {
        throw new CommandError('name', language);
      }
      const client = this.#clientOrFail();
      const text = typeof content === 'string' ? content.trim() : '';
      let target;
      let page;
      try {
        target = await this.#resolveBook(client, book);
        page = await client.createPage({
          bookId: target.id,
          name: title,
          ...(text ? { markdown: text } : {}),
          tags: parseTags(tags),
        });
      } catch (err) {
        throw this.#commandError(err);
      }
      this.#remember(page);
      logger.info('Page created');
      this.refresh().catch(() => {});
      return this.#written(page, target, true);
    });
  }

  /**
   * Add a line at the end of a page of a book (a journal), created if missing.
   * @param {{ book: unknown, page: unknown, line: unknown, addTime?: unknown }} request
   */
  appendToPage({ book, page: pageName, line, addTime }) {
    return this.#serialize(async () => {
      const language = this.language;
      const title = typeof pageName === 'string' ? pageName.trim().slice(0, 255) : '';
      if (!title) {
        throw new CommandError('name', language);
      }
      const typed = typeof line === 'string' ? line.trim().slice(0, 5000) : '';
      if (!typed) {
        throw new CommandError('line', language);
      }
      const text =
        addTime === false || addTime === 'false' ? typed : `${stamp(this.now())} — ${typed}`;
      const client = this.#clientOrFail();
      let target;
      let written;
      let created = false;
      try {
        target = await this.#resolveBook(client, book);
        const lower = title.toLocaleLowerCase();
        const candidates = await client.pages({
          count: 100,
          sort: 'id',
          filters: { book_id: target.id, name: title },
        });
        const existing =
          candidates.data.find((p) => p.name === title) ??
          candidates.data.find((p) => String(p.name).toLocaleLowerCase() === lower);
        if (existing) {
          const full = await client.page(existing.id);
          written = await client.updatePage(existing.id, appendLine(full, text));
        } else {
          written = await client.createPage({ bookId: target.id, name: title, markdown: text });
          created = true;
        }
      } catch (err) {
        throw this.#commandError(err);
      }
      this.#remember(written);
      logger.info(created ? 'Journal page created' : 'Line added to a page');
      this.refresh().catch(() => {});
      return this.#written(written, target, created);
    });
  }

  #written(page, book, created) {
    return {
      page_id: page.id,
      page_name: String(page.name ?? ''),
      book_name: book.name,
      url: summarizePage(
        { ...page, book_slug: page.book_slug ?? book.slug },
        this.booksById,
        this.config.url,
      ).url,
      created,
    };
  }

  #remember(page) {
    if (!page?.updated_at) {
      return;
    }
    this.own.add(ownKey(page));
    if (this.own.size > MAX_OWN) {
      this.own.delete(this.own.values().next().value);
    }
    // Kept on disk: a restart before the next read must not announce it.
    if (this.seen) {
      this.store.save({ ...this.seen, own: [...this.own] }).catch(() => {});
    }
  }

  #commandError(err) {
    if (err instanceof CommandError) {
      return err;
    }
    const kind = err instanceof BookStackError ? err.kind : 'unreachable';
    const detail = err.message.replace(/^[^:]*: /, '');
    if (kind === 'unauthorized' || kind === 'no_api') {
      return new CommandError('unauthorized', this.language);
    }
    if (kind === 'forbidden') {
      return new CommandError('forbidden', this.language);
    }
    if (kind === 'rejected') {
      return new CommandError('rejected', this.language, { detail });
    }
    if (kind === 'timeout') {
      // The request may have reached BookStack: the page may be written.
      return new CommandError('timeout', this.language);
    }
    if (kind === 'unreachable') {
      return new CommandError('unreachable', this.language);
    }
    return new CommandError('http', this.language, { detail });
  }
}
