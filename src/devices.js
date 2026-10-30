// -----------------------------------------------------------------------------
// BookStack -> Gladys devices:
// - one "BookStack" device per instance (`bookstack:<instance>`): books,
//   shelves, pages, pages changed today, latest changed page;
// - one device per book (`book:<instance>_<book id>`): its number of pages.
//   Every book is offered in Discovery; the user adds the ones they care
//   about (they become the book filter of the triggers and of the widget).
// Everything is read only: pages are written through the scene actions.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPE,
} from '@gladysassistant/integration-sdk';
import { NAMES, NONE, pick } from './texts.js';

export const BOOKSTACK_TYPE = 'bookstack';
export const BOOK_TYPE = 'book';
export const COUNTERS = ['books', 'shelves', 'pages', 'today'];
// Gladys keeps every discovered device in its list: a wiki with hundreds of
// books offers the first ones only.
export const MAX_BOOKS = 100;

const MAX_COUNT = 10_000_000;

export const bookstackIds = (gladys, instance) => gladys.externalIds(BOOKSTACK_TYPE, instance);
export const bookIds = (gladys, instance, bookId) =>
  gladys.externalIds(BOOK_TYPE, `${instance}_${bookId}`);

const counter = (name, externalId) => ({
  name,
  external_id: externalId,
  category: CAT.COUNTER_SENSOR,
  type: TYPE.SENSOR.INTEGER,
  read_only: true,
  has_feedback: false,
  min: 0,
  max: MAX_COUNT,
  keep_history: true,
});

/**
 * @param {object} gladys
 * @param {{ id: string, version: string }} instance
 * @param {string} language
 * @param {string} url BookStack base URL (a device param, shown in Gladys)
 */
export function buildBookStackDevice(gladys, instance, language, url) {
  const names = pick(NAMES, language);
  const ids = bookstackIds(gladys, instance.id);
  return {
    name: 'BookStack',
    external_id: ids.device,
    model: 'BookStack',
    should_poll: false,
    features: [
      ...COUNTERS.map((key) => counter(names[key], ids.feature(key))),
      {
        name: names.latest,
        external_id: ids.feature('latest'),
        category: CAT.TEXT,
        type: TYPE.TEXT.TEXT,
        read_only: true,
        has_feedback: false,
        min: 0,
        max: 0,
        keep_history: false,
      },
    ],
    params: [
      { name: 'BOOKSTACK_URL', value: url },
      { name: 'BOOKSTACK_VERSION', value: instance.version || '?' },
    ],
  };
}

/**
 * @param {object} gladys
 * @param {string} instance
 * @param {{ id: number, name: string }} book
 * @param {string} language
 */
export function buildBookDevice(gladys, instance, book, language) {
  const ids = bookIds(gladys, instance, book.id);
  return {
    name: book.name.slice(0, 100),
    external_id: ids.device,
    model: 'BookStack book',
    should_poll: false,
    features: [counter(pick(NAMES, language).pages, ids.feature('pages'))],
    params: [{ name: 'BOOKSTACK_BOOK_ID', value: String(book.id) }],
  };
}

/**
 * @param {object} gladys
 * @param {string} instance
 * @param {{ books: number, shelves: number, pages: number, today: number }} counters
 * @param {{ name: string } | undefined} latest the page changed last
 * @param {string} language
 */
export function buildBookStackStates(gladys, instance, counters, latest, language) {
  const ids = bookstackIds(gladys, instance);
  return [
    ...COUNTERS.map((key) => ({
      device_feature_external_id: ids.feature(key),
      state: counters[key],
    })),
    {
      device_feature_external_id: ids.feature('latest'),
      text: (latest?.name || pick(NONE, language)).slice(0, 200),
    },
  ];
}

export function buildBookStates(gladys, instance, bookId, pages) {
  return [
    {
      device_feature_external_id: bookIds(gladys, instance, bookId).feature('pages'),
      state: pages,
    },
  ];
}

/**
 * `ext:...:bookstack:<instance>` -> { kind: 'bookstack', instance }, and
 * `ext:...:book:<instance>_<id>` -> { kind: 'book', instance, bookId };
 * null when not ours.
 */
export function parseExternalId(gladys, externalId) {
  if (typeof externalId !== 'string') {
    return null;
  }
  for (const kind of [BOOKSTACK_TYPE, BOOK_TYPE]) {
    const prefix = gladys.externalId(`${kind}:`);
    if (!externalId.startsWith(prefix)) {
      continue;
    }
    const id = externalId.slice(prefix.length).split(':')[0];
    if (kind === BOOKSTACK_TYPE) {
      return id === '' ? null : { kind, instance: id };
    }
    const cut = id.lastIndexOf('_');
    const bookId = Number(id.slice(cut + 1));
    if (cut <= 0 || !Number.isInteger(bookId)) {
      return null;
    }
    return { kind, instance: id.slice(0, cut), bookId };
  }
  return null;
}

/**
 * The instance id: the `instance_id` of BookStack when it gives one, else
 * the address it is reached at (older BookStack), without its scheme.
 * Colons and underscores are kept out: they separate the parts of the ids.
 * @param {object | null} system the answer of GET /api/system
 * @param {string} url
 */
export function instanceId(system, url) {
  const raw =
    typeof system?.instance_id === 'string' && system.instance_id.trim() !== ''
      ? system.instance_id.trim()
      : url.replace(/^https?:\/\//i, '');
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
