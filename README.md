# BookStack for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for
[BookStack](https://www.bookstackapp.com), the self-hosted wiki: follow your
counters, react when a page is created or updated, write pages from scenes and
keep a journal page that Gladys fills in line by line. Local only.

Tested against a real BookStack v26.09.2 (linuxserver.io Docker image).

## Features

- **A BookStack device**: books, shelves, pages, pages changed today, and the
  name of the latest changed page.
- **One device per book**: its number of pages. Add the ones you follow.
- **Dashboard widget** "BookStack": three tiles and the pages changed last (of
  every book or of one), each opening in BookStack over https.
- **Scene triggers** "BookStack page created or updated" (filters: book,
  created or updated) and "Tagged BookStack page changed" (filter: a tag),
  silent at installation, remembered across restarts.
- **Scene actions**: "Create a BookStack page" (Markdown content, tags) and "Add
  a line to a BookStack page" (a journal, dated, created at its first line).
- Texts in English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1 or later.
- BookStack reachable from Gladys, and an API token (My Account → Access &
  Security → API Tokens) whose owner has the "Access system API" permission.

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-bookstack` (or find **BookStack** in the
   catalog).
2. In **Configuration**, enter the address of BookStack
   (`192.168.1.50:6875`), the token ID and the token secret. Save.
3. Add the **BookStack** device, and the books you want, from the **Discover**
   tab.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

BookStack pushes nothing: the container reads it every 15 minutes by default (5
to 60), and just after midnight, through the REST API (`Authorization: Token
<id>:<secret>`): `/system` once, `/books`, three totals (`/shelves`, `/pages`,
pages with `filter[updated_at:gte]=<midnight>`), the newest changed pages, one
total per book added to Gladys, and `GET /pages/{id}` for each change announced
(its tags and author). The triggers keep the time of the newest change seen in
`/data`. The devices are published with `should_poll: false`; only changed
states are sent to Gladys. The audit log is not used: it needs an admin token,
and the page list gives the same changes to any user.

## Limitations

- One BookStack user, the owner of the token, with their permissions.
- The triggers fire at the next read, not instantly; at most ten pages per
  read. Deleted and moved pages are not announced.
- Nothing is ever deleted or moved in BookStack.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys and a fake BookStack answering with
bodies recorded on a real BookStack v26.09.2 (`test/fixtures/bookstack/`).

## Credits

- [BookStack](https://github.com/BookStackApp/BookStack), by Dan Brown and
  contributors (MIT): this integration only talks to its REST API and contains
  none of its code.
- The cover shows the BookStack logo by Dan Brown (MIT), from
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:BookStack_logo.svg).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by the BookStack
project.

## License

Apache-2.0, see [`LICENSE`](LICENSE).
