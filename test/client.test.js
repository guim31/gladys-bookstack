// -----------------------------------------------------------------------------
// The BookStack client and the configuration, on the answers recorded on a
// real BookStack v26.09.2: the token header, errors by kind, the filters.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BookStackClient, BookStackError, filterDate } from '../src/bookstack/client.js';
import { appendLine, findBook, parseTags, summarizeBook } from '../src/bookstack/model.js';
import { normalizeConfig, normalizeUrl } from '../src/config.js';
import { HOST, fixture } from './helpers/fakeBookStack.js';

/** A fetch answering one recorded fixture, and keeping the request. */
function replay(name, type = 'application/json') {
  const calls = [];
  const { status, body } = fixture(name);
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });
  };
  return {
    calls,
    client: new BookStackClient({ url: HOST, tokenId: 'id', tokenSecret: 'sec', fetch }),
  };
}

test('the token goes in the Authorization header, lists are read with their filters', async () => {
  const { calls, client } = replay('pages-count-book');
  assert.equal(await client.count('pages', { book_id: 1 }), 2);
  assert.equal(calls[0].init.headers.Authorization, 'Token id:sec');
  assert.equal(calls[0].url, `${HOST}/api/pages?count=1&filter%5Bbook_id%5D=1`);
  assert.equal(filterDate(Date.parse('2026-10-29T23:00:00Z')), '2026-10-29 23:00:00');
});

test('errors by kind, with the reason BookStack gave and never the token', async () => {
  const cases = [
    ['bad-token', 'unauthorized', /No matching API token/],
    ['token-format', 'unauthorized', /format appeared incorrect/],
    ['no-api-permission', 'no_api', /make API calls/],
    ['page-create-forbidden', 'forbidden', /do not have permission/],
    ['page-create-invalid', 'rejected', /The name field is required/],
    ['page-not-found', 'not_found', /Page not found/],
  ];
  for (const [name, kind, message] of cases) {
    const { client } = replay(name);
    await assert.rejects(client.page(5), (err) => {
      assert.ok(err instanceof BookStackError);
      assert.equal(err.kind, kind, name);
      assert.match(err.message, message);
      assert.ok(!err.message.includes('sec'), 'no secret');
      return true;
    });
  }
});

test('an HTML page is not BookStack; an old BookStack has no /system', async () => {
  const html = async () =>
    new Response('<!DOCTYPE html><html></html>', {
      status: 404,
      headers: { 'content-type': 'text/html' },
    });
  const client = new BookStackClient({ url: HOST, tokenId: 'a', tokenSecret: 'b', fetch: html });
  assert.equal(await client.system(), null);
  await assert.rejects(client.count('books'), (err) => err.kind === 'invalid');
  const login = async () => new Response('<html>Login</html>', { status: 200 });
  const proxied = new BookStackClient({ url: HOST, tokenId: 'a', tokenSecret: 'b', fetch: login });
  await assert.rejects(proxied.count('books'), (err) => err.kind === 'invalid');
});

test('the address: scheme, port, reverse-proxy path, pasted API or page path', () => {
  assert.equal(normalizeUrl('192.0.2.50:6875'), 'http://192.0.2.50:6875');
  assert.equal(normalizeUrl('https://example.org/wiki/'), 'https://example.org/wiki');
  assert.equal(normalizeUrl('http://192.0.2.50/api/docs'), 'http://192.0.2.50');
  assert.equal(
    normalizeUrl('https://example.org/wiki/books/maison/page/journal'),
    'https://example.org/wiki',
  );
  assert.equal(normalizeUrl('ftp://x'), null);
  assert.equal(normalizeUrl('http://user:pass@x'), null);
  const config = normalizeConfig({ url: 'x', token_id: ' Token abc:def ', refresh_minutes: 7 });
  assert.deepEqual([config.tokenId, config.tokenSecret, config.refreshMinutes], ['abc', 'def', 15]);
  assert.equal(normalizeConfig({}).language, 'fr');
});

test('books typed by users, tags, lines added to a page', () => {
  const books = fixture('books').body.data.map(summarizeBook);
  assert.equal(findBook(books, 'maison').id, 1);
  assert.equal(findBook(books, 'Recettes').id, 2);
  assert.equal(findBook(books, '2').id, 2);
  assert.equal(findBook(books, 'Garage'), undefined);
  assert.deepEqual(parseTags('a, b = c ; A'), [{ name: 'a' }, { name: 'b', value: 'c' }]);
  assert.deepEqual(appendLine(fixture('page-markdown').body, 'x'), {
    markdown: '# Journal\n\n- début\n- 30/10 : deuxième ligne\n\nx',
  });
  assert.match(appendLine(fixture('page-wysiwyg').body, 'a < b').html, /\n<p>a &lt; b<\/p>$/);
  assert.deepEqual(appendLine({ editor: 'markdown', markdown: '' }, 'first'), {
    markdown: 'first',
  });
});
