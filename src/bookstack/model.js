// -----------------------------------------------------------------------------
// BookStack answers -> plain values, and what users type in scenes (a book
// name, tags, a line for a journal page) -> what the API wants.
// -----------------------------------------------------------------------------

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

/** The address of a page in BookStack. */
export const pageUrl = (baseUrl, page) =>
  page.book_slug && page.slug
    ? `${baseUrl}/books/${encodeURIComponent(page.book_slug)}/page/${encodeURIComponent(page.slug)}`
    : `${baseUrl}/link/${page.id}`;

/** A book as the integration keeps it. */
export const summarizeBook = (book) => ({
  id: book.id,
  name: clean(book.name) || `#${book.id}`,
  slug: clean(book.slug),
});

/**
 * A page of the list (or a full page) as the integration keeps it.
 * @param {object} page
 * @param {Map<number, { name: string }>} books
 * @param {string} baseUrl
 */
export function summarizePage(page, books, baseUrl) {
  return {
    id: page.id,
    name: clean(page.name) || `#${page.id}`,
    bookId: page.book_id,
    book: books.get(page.book_id)?.name ?? '',
    created: page.created_at,
    updated: page.updated_at,
    url: pageUrl(baseUrl, page),
  };
}

/** `[{ name: 'entretien', value: 'annuel' }]` -> `entretien: annuel`. */
export const tagText = (tag) =>
  clean(tag?.value) ? `${clean(tag?.name)}: ${clean(tag.value)}` : clean(tag?.name);

/** The distinct tag names of a page, as written in BookStack. */
export function tagNames(tags) {
  const seen = new Set();
  for (const tag of Array.isArray(tags) ? tags : []) {
    const name = clean(tag?.name);
    if (name) {
      seen.add(name);
    }
  }
  return [...seen];
}

/**
 * `journal, type=note` -> `[{ name: 'journal' }, { name: 'type', value: 'note' }]`.
 * @param {unknown} text
 */
export function parseTags(text) {
  const tags = [];
  const seen = new Set();
  for (const part of clean(text).split(/[,;\n]/)) {
    const cut = part.indexOf('=');
    const name = clean(cut < 0 ? part : part.slice(0, cut)).slice(0, 191);
    const value = cut < 0 ? '' : clean(part.slice(cut + 1)).slice(0, 191);
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      tags.push(value ? { name, value } : { name });
    }
  }
  return tags.slice(0, 20);
}

/**
 * The book a user typed: its id, its slug or its name (case insensitive).
 * @param {{ id: number, name: string, slug: string }[]} books
 * @param {unknown} wanted
 */
export function findBook(books, wanted) {
  const text = clean(String(wanted ?? ''));
  if (text === '') {
    return undefined;
  }
  const lower = text.toLocaleLowerCase();
  if (/^\d+$/.test(text)) {
    const byId = books.find((b) => b.id === Number(text));
    if (byId) {
      return byId;
    }
  }
  return (
    books.find((b) => b.name === text) ??
    books.find((b) => b.name.toLocaleLowerCase() === lower) ??
    books.find((b) => b.slug === lower)
  );
}

const escapeHtml = (text) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/** `2026-10-30 08:15`, in the time zone of Gladys (TZ, set by its supervisor). */
export function stamp(time) {
  const date = new Date(time);
  const two = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ` +
    `${two(date.getHours())}:${two(date.getMinutes())}`
  );
}

/** Whether a page is written in Markdown (else in the WYSIWYG editor). */
export const isMarkdown = (page) =>
  page.editor === 'markdown' || (!page.editor && clean(page.markdown) !== '');

/**
 * The new content of a page once a line is added at its end, in the editor
 * the page uses: a Markdown paragraph (the line may hold Markdown), or an
 * HTML paragraph (the line is escaped).
 * @param {{ editor?: string, markdown?: string, html?: string }} page
 * @param {string} line
 */
export function appendLine(page, line) {
  if (isMarkdown(page)) {
    const before = (page.markdown ?? '').replace(/\s+$/, '');
    return { markdown: before ? `${before}\n\n${line}` : line };
  }
  const html = `<p>${escapeHtml(line)}</p>`;
  // `raw_html` is the stored content; `html` has the includes
  // ({{@id#bkmrk-…}}) resolved, which would freeze them in the page.
  const stored = typeof page.raw_html === 'string' ? page.raw_html : page.html;
  const before = (stored ?? '').replace(/\s+$/, '');
  return { html: before ? `${before}\n${html}` : html };
}
