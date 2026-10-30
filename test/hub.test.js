// -----------------------------------------------------------------------------
// The hub against the SDK's fake Gladys and a fake BookStack built from real
// answers: devices and states, the timer, the triggers, the scene actions,
// the widget and the connection status.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { MAX_TRIES, startOfDay } from '../src/hub.js';
import { MemoryStore } from '../src/store.js';
import { HOST, TOKEN_ID, TOKEN_SECRET, createBookStack, settle } from './helpers/fakeBookStack.js';
import {
  CONFIG,
  bookDevice,
  createAll,
  createWorld,
  mainDevice,
  mainFeature,
} from './helpers/world.js';

const changed = (fake) => fake.sceneEvents.filter((e) => e.key === 'page_changed');
const tagged = (fake) => fake.sceneEvents.filter((e) => e.key === 'tagged_page_changed');

test('a BookStack device and one device per book, states once added', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const devices = world.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => [d.name, d.external_id]),
    [
      ['BookStack', mainDevice],
      ['Maison', bookDevice(1)],
      ['Recettes', bookDevice(2)],
    ],
  );
  assert.equal(world.fake.states.length, 0, 'no state before the devices are added');
  await createAll(world.fake);
  await world.hub.refresh();
  assert.equal(world.fake.lastState(mainFeature('books')), 2);
  assert.equal(world.fake.lastState(mainFeature('shelves')), 1);
  assert.equal(world.fake.lastState(mainFeature('pages')), 3);
  assert.equal(world.fake.lastState(mainFeature('today')), 3);
  assert.equal(world.fake.lastState(mainFeature('latest')), 'Journal');
  assert.equal(world.fake.lastState(`${bookDevice(1)}:pages`), 2);
  assert.equal(world.fake.lastState(`${bookDevice(2)}:pages`), 1);
  assert.equal(devices[0].params.find((p) => p.name === 'BOOKSTACK_VERSION').value, 'v26.09.2');
});

test('a device added gets its states at once, a book is counted from then on', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.fake.deviceCreated(world.fake.discoveredDevices[2]);
  await settle();
  assert.equal(world.fake.lastState(`${bookDevice(2)}:pages`), 1);
  const reads = world.server.state.requests.filter((r) => r.includes('book_id')).length;
  assert.equal(reads, 1, 'only the book added is counted');
});

test('the container reads BookStack on its own timer, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const world = await createWorld({ config: { ...CONFIG, refresh_minutes: '5' } });
  t.after(() => world.app.stop());
  await createAll(world.fake);
  world.server.addPage({ name: 'Read me' });
  t.mock.timers.tick(5 * 60_000);
  await settle(20);
  assert.equal(world.fake.lastState(mainFeature('pages')), 4);
  assert.equal(world.fake.lastState(mainFeature('latest')), 'Read me');
  assert.ok(!world.fake.requests.some((r) => r.path?.includes('poll')));
});

test('pages changed today fall back to 0 after midnight', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world.fake);
  assert.equal(world.fake.lastState(mainFeature('today')), 3);
  world.clock.now = startOfDay(world.clock.now) + 24 * 3_600_000 + 60_000;
  world.server.state.clock = world.clock.now;
  await world.hub.refresh();
  assert.equal(world.fake.lastState(mainFeature('today')), 0);
  world.server.editPage(6);
  await world.hub.refresh();
  assert.equal(world.fake.lastState(mainFeature('today')), 1);
  assert.equal(world.fake.lastState(mainFeature('pages')), 3);
});

test('page changed: silent baseline, created then updated, book, tags, author', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal(world.fake.sceneEvents.length, 0, 'the first read announces nothing');
  const page = world.server.addPage({
    name: 'Chaudière : panne',
    bookId: 1,
    tags: ['incident', { name: 'pièce', value: 'cave' }],
    by: 'Camille',
  });
  await world.hub.refresh();
  world.server.editPage(page.id, { by: 'Dominique' });
  world.server.editPage(6);
  await world.hub.refresh();
  await world.hub.refresh();
  assert.deepEqual(
    changed(world.fake).map((e) => e.data),
    [
      {
        book: bookDevice(1),
        change: 'created',
        page_name: 'Chaudière : panne',
        book_name: 'Maison',
        url: `${HOST}/books/maison/page/chaudiere-panne`,
        updated_by: 'Camille',
        tags: 'incident, pièce: cave',
        page_id: page.id,
      },
      {
        book: bookDevice(1),
        change: 'updated',
        page_name: 'Chaudière : panne',
        book_name: 'Maison',
        url: `${HOST}/books/maison/page/chaudiere-panne`,
        updated_by: 'Dominique',
        tags: 'incident, pièce: cave',
        page_id: page.id,
      },
      {
        book: bookDevice(2),
        change: 'updated',
        page_name: 'Tarte aux pommes',
        book_name: 'Recettes',
        url: `${HOST}/books/recettes/page/tarte-aux-pommes`,
        updated_by: 'Admin',
        tags: '',
        page_id: 6,
      },
    ],
  );
  // One tagged event per tag name: a scene set on "incident" runs once.
  assert.deepEqual(
    tagged(world.fake).map((e) => [e.data.tag, e.data.change]),
    [
      ['incident', 'created'],
      ['pièce', 'created'],
      ['incident', 'updated'],
      ['pièce', 'updated'],
    ],
  );
});

test('more than ten changes: ten now, the rest at the next read, oldest first', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  for (let i = 0; i < 15; i += 1) {
    world.server.addPage({ name: `Note ${i}`, bookId: 2 });
  }
  await world.hub.refresh();
  assert.deepEqual(
    changed(world.fake).map((e) => e.data.page_name),
    Array.from({ length: 10 }, (_, i) => `Note ${i}`),
  );
  await world.hub.refresh();
  await world.hub.refresh();
  assert.deepEqual(
    changed(world.fake).map((e) => e.data.page_name),
    Array.from({ length: 15 }, (_, i) => `Note ${i}`),
  );
});

test('a burst (an import): ten announced, the rest seen', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  for (let i = 0; i < 60; i += 1) {
    world.server.addPage({ name: `Import ${i}`, bookId: 2 });
  }
  await world.hub.refresh();
  assert.equal(changed(world.fake).length, 10);
  world.server.addPage({ name: 'After' });
  await world.hub.refresh();
  assert.deepEqual(changed(world.fake).at(-1).data.page_name, 'After');
  assert.equal(changed(world.fake).length, 11, 'never twice');
});

test('an event Gladys took is not sent again when a later one fails', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const publish = world.gladys.publishSceneEvent.bind(world.gladys);
  let fail = 1;
  world.gladys.publishSceneEvent = async (key, data) => {
    if (key === 'tagged_page_changed' && fail > 0) {
      fail -= 1;
      throw Object.assign(new Error('busy'), { status: 503 });
    }
    return publish(key, data);
  };
  world.server.addPage({ name: 'Tagged', tags: ['incident'] });
  await world.hub.refresh();
  await world.hub.refresh();
  assert.equal(changed(world.fake).length, 1);
  assert.equal(tagged(world.fake).length, 1);
});

test('a page BookStack cannot read is given up, the next ones go through', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const broken = world.server.addPage({ name: 'Broken' });
  world.server.addPage({ name: 'Fine' });
  const fetch = world.server.fetch;
  world.hub.client.fetch = async (url, init) =>
    url.endsWith(`/api/pages/${broken.id}`)
      ? new Response('{"error":{"message":"Server Error","code":500}}', { status: 500 })
      : fetch(url, init);
  for (let i = 0; i < MAX_TRIES; i += 1) {
    await world.hub.refresh();
  }
  assert.deepEqual(
    changed(world.fake).map((e) => e.data.page_name),
    ['Fine'],
  );
});

test('an event Gladys did not take is fired again at the next read', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const publish = world.gladys.publishSceneEvent.bind(world.gladys);
  let down = true;
  world.gladys.publishSceneEvent = async (...args) => {
    if (down) {
      throw Object.assign(new Error('Gladys restarting'), { status: 503 });
    }
    return publish(...args);
  };
  world.server.addPage({ name: 'First' });
  world.server.addPage({ name: 'Second' });
  await world.hub.refresh();
  assert.equal(changed(world.fake).length, 0);
  down = false;
  await world.hub.refresh();
  assert.deepEqual(
    changed(world.fake).map((e) => e.data.page_name),
    ['First', 'Second'],
  );
});

test('a change Gladys keeps refusing is given up, the next ones go through', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const publish = world.gladys.publishSceneEvent.bind(world.gladys);
  world.gladys.publishSceneEvent = async (key, data) => {
    if (data.page_name === 'Poison') {
      throw Object.assign(new Error('boom'), { status: 500 });
    }
    return publish(key, data);
  };
  world.server.addPage({ name: 'Poison' });
  world.server.addPage({ name: 'Fine' });
  for (let i = 0; i < MAX_TRIES; i += 1) {
    await world.hub.refresh();
  }
  assert.deepEqual(
    changed(world.fake).map((e) => e.data.page_name),
    ['Fine'],
  );
});

test('the last change seen survives a restart', async (t) => {
  const store = new MemoryStore();
  const server = createBookStack();
  const first = await createWorld({ server, store });
  server.addPage({ name: 'Before' });
  await first.hub.refresh();
  assert.equal(changed(first.fake).length, 1);
  await first.app.stop();
  server.addPage({ name: 'While stopped' });
  const second = await createWorld({ server, store });
  t.after(() => second.app.stop());
  assert.deepEqual(
    changed(second.fake).map((e) => e.data.page_name),
    ['While stopped'],
  );
});

test('append_line: a journal page in Markdown, created then extended, never announced', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  let ack = await world.fake.sceneAction('append_line', {
    book: 'maison',
    page: 'Journal de la chaudière',
    line: 'Pression basse : 0,8 bar',
    add_time: true,
  });
  assert.equal(ack.success, true, ack.error);
  const outputs = ack.data.outputs;
  assert.equal(outputs.created, true);
  assert.equal(outputs.book_name, 'Maison');
  assert.equal(outputs.url, `${HOST}/books/maison/page/journal-de-la-chaudiere`);
  ack = await world.fake.sceneAction('append_line', {
    book: 'Maison',
    page: 'journal de la chaudière',
    line: 'Relancée',
    add_time: false,
  });
  assert.equal(ack.data.outputs.created, false);
  assert.equal(ack.data.outputs.page_id, outputs.page_id);
  const page = world.server.state.pages.find((p) => p.id === outputs.page_id);
  const local = new Date(world.clock.now);
  const hh = String(local.getHours()).padStart(2, '0');
  assert.match(
    page.markdown,
    new RegExp(`^2026-10-(29|30) ${hh}:00 — Pression basse : 0,8 bar\n\nRelancée$`),
  );
  await world.hub.refresh();
  await world.hub.refresh();
  assert.equal(world.fake.sceneEvents.length, 0, 'no loop through the trigger');
  // A person who edits the journal afterwards is announced.
  world.server.editPage(outputs.page_id, { by: 'Camille' });
  await world.hub.refresh();
  assert.deepEqual(
    changed(world.fake).map((e) => [e.data.page_name, e.data.updated_by]),
    [['Journal de la chaudière', 'Camille']],
  );
});

test('append_line: a WYSIWYG page gets an escaped paragraph', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.server.state.pages.find((p) => p.id === 7).rendered = '<p>stale rendering</p>';
  const ack = await world.fake.sceneAction('append_line', {
    book: 'Maison',
    page: 'Chaudière',
    line: '<b>Purge</b> & contrôle',
    add_time: false,
  });
  assert.equal(ack.success, true, ack.error);
  const page = world.server.state.pages.find((p) => p.id === 7);
  assert.ok(!page.html.includes('stale rendering'), 'the stored content is extended');
  assert.ok(page.html.endsWith('\n<p>&lt;b&gt;Purge&lt;/b&gt; &amp; contrôle</p>'), page.html);
  assert.ok(page.html.startsWith('<p id="bkmrk-'), 'the page keeps its content');
});

test('two lines at once both land in the page', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const lines = ['One', 'Two', 'Three'];
  const acks = await Promise.all(
    lines.map((line) =>
      world.fake.sceneAction('append_line', {
        book: 'Maison',
        page: 'Journal',
        line,
        add_time: false,
      }),
    ),
  );
  assert.ok(acks.every((a) => a.success));
  const page = world.server.state.pages.find((p) => p.id === 5);
  assert.ok(page.markdown.endsWith('One\n\nTwo\n\nThree'), page.markdown);
});

test('create_page: in a book by name, with content and tags', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('create_page', {
    book: 'recettes',
    name: 'Soupe',
    content: '# Soupe\n\nPoireaux.',
    tags: 'hiver, temps=30 min, hiver',
  });
  assert.equal(ack.success, true, ack.error);
  const page = world.server.state.pages.find((p) => p.id === ack.data.outputs.page_id);
  assert.equal(page.book_id, 2);
  assert.equal(page.markdown, '# Soupe\n\nPoireaux.');
  assert.deepEqual(
    page.tags.map((tag) => [tag.name, tag.value ?? '']),
    [
      ['hiver', ''],
      ['temps', '30 min'],
    ],
  );
  const empty = await world.fake.sceneAction('create_page', { book: '2', name: 'Vide' });
  assert.equal(empty.success, true, empty.error);
  assert.equal(world.server.state.pages.find((p) => p.name === 'Vide').editor, 'wysiwyg');
});

test('scene actions: errors in clear words, an unknown book is never created', async (t) => {
  const world = await createWorld({ config: { ...CONFIG, language: 'en' } });
  t.after(() => world.app.stop());
  let ack = await world.fake.sceneAction('create_page', { book: 'Garage', name: 'X' });
  assert.equal(ack.success, false);
  assert.equal(ack.error, 'No book "Garage" in BookStack.');
  assert.equal(world.server.state.books.length, 2);
  ack = await world.fake.sceneAction('append_line', { book: 'Maison', page: 'Journal', line: ' ' });
  assert.equal(ack.error, 'Enter the line to add.');
  world.server.state.readOnly = true;
  ack = await world.fake.sceneAction('append_line', { book: 'Maison', page: 'Journal', line: 'x' });
  assert.equal(ack.error, 'The owner of the token may not write in this book: nothing was done.');
  world.server.goDown();
  ack = await world.fake.sceneAction('create_page', { book: 'Maison', name: 'X' });
  assert.equal(ack.error, 'BookStack does not answer: nothing was done.');
});

test('widget: counters, pages changed last, a book, counters hidden', async (t) => {
  const world = await createWorld({
    server: (() => {
      const server = createBookStack();
      return server;
    })(),
  });
  t.after(() => world.app.stop());
  let content = (await world.fake.widgetGet('pages', { language: 'fr', settings: {} })).data
    .content;
  validateWidgetContent(content);
  assert.deepEqual(
    content.components.slice(0, 3).map((c) => [c.label, c.value]),
    [
      ['Livres', 2],
      ['Pages', 3],
      ["Aujourd'hui", 3],
    ],
  );
  const list = content.components[3];
  assert.equal(list.type, 'card-list');
  assert.deepEqual(
    list.items.map((i) => i.title),
    ['Journal', 'Chaudière', 'Tarte aux pommes'],
  );
  assert.match(list.items[0].subtitle, /^Maison · 30 oct\./);
  assert.equal(list.items[0].links, undefined, 'no link to a BookStack on plain http');

  await world.fake.deviceCreated(world.fake.discoveredDevices[1]);
  await world.fake.deviceUpdated({ ...world.fake.discoveredDevices[1], name: 'Notre maison' });
  content = (
    await world.fake.widgetGet('pages', { language: 'en', settings: { book: bookDevice(1) } })
  ).data.content;
  validateWidgetContent(content);
  assert.deepEqual([content.components[0].label, content.components[0].value], ['Notre maison', 2]);
  assert.deepEqual(
    content.components[1].items.map((i) => i.title),
    ['Journal', 'Chaudière'],
  );
  content = (
    await world.fake.widgetGet('pages', { settings: { book: bookDevice(1), hide_counters: true } })
  ).data.content;
  assert.equal(content.components.length, 1);
});

test('widget links to BookStack over https', async (t) => {
  const world = await createWorld({
    config: { ...CONFIG, url: 'https://wiki.example.org/' },
  });
  t.after(() => world.app.stop());
  const content = (await world.fake.widgetGet('pages', { settings: {} })).data.content;
  assert.deepEqual(content.components[3].items[0].links, [
    { url: 'https://wiki.example.org/books/maison/page/journal', label: 'Open in BookStack' },
  ]);
});

test('connection status: missing settings, refused token, no API, down and back, not BookStack', async (t) => {
  const world = await createWorld({ config: { url: '' } });
  t.after(() => world.app.stop());
  assert.match(world.fake.connectionStatus.message.en, /Enter the address/);
  await world.fake.configUpdated({ url: 'ftp://x', token_id: TOKEN_ID, token_secret: 'x' });
  assert.match(world.fake.connectionStatus.message.en, /not valid/);
  await world.fake.configUpdated({ url: HOST, token_id: TOKEN_ID });
  assert.match(world.fake.connectionStatus.message.en, /token ID and the token secret/);
  await world.fake.configUpdated({ url: HOST, token_id: TOKEN_ID, token_secret: 'wrong' });
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.en, /refused the API token/);
  // "id:secret" pasted whole in the first field.
  await world.fake.configUpdated({ url: `${HOST}/api`, token_id: `${TOKEN_ID}:${TOKEN_SECRET}` });
  assert.equal(world.fake.connectionStatus.connected, true);
  world.server.state.noApi = true;
  await world.hub.refresh();
  assert.match(world.fake.connectionStatus.message.en, /Access system API/);
  world.server.state.noApi = false;
  world.server.goDown();
  await world.hub.refresh();
  assert.match(world.fake.connectionStatus.message.en, /does not answer/);
  const widget = (await world.fake.widgetGet('pages', { settings: {} })).data.content;
  assert.ok(widget.components.some((c) => /does not answer/.test(c.text ?? '')));
  world.server.goUp();
  await world.hub.refresh();
  assert.equal(world.fake.connectionStatus.connected, true);
  world.server.state.html = true;
  await world.hub.refresh();
  assert.match(world.fake.connectionStatus.message.en, /does not answer like BookStack/);
});

test('test_connection: how many books and pages', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.action('test_connection');
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.message.fr, 'Connecté à BookStack : 2 livre(s), 3 page(s).');
});

test('an older BookStack without /api/system: the address names the instance', async (t) => {
  const server = createBookStack();
  server.state.noSystem = true;
  const world = await createWorld({ server });
  t.after(() => world.app.stop());
  assert.equal(
    world.fake.discoveredDevices[0].external_id,
    'ext:test-integration:bookstack:192.0.2.50-6875',
  );
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('the language changes the names, not the devices', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const before = world.fake.discoveredDevices.map((d) => d.external_id);
  assert.equal(world.fake.discoveredDevices[0].features[3].name, "Pages modifiées aujourd'hui");
  await world.fake.configUpdated({ ...CONFIG, language: 'de' });
  assert.deepEqual(
    world.fake.discoveredDevices.map((d) => d.external_id),
    before,
  );
  assert.equal(world.fake.discoveredDevices[0].features[3].name, 'Heute geänderte Seiten');
});
