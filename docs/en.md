# BookStack

Connect Gladys to [BookStack](https://www.bookstackapp.com), the self-hosted
wiki organised in shelves, books, chapters and pages: follow your counters,
react when a page is created or updated, write pages from your scenes, and keep
a journal (the boiler, the alarm, the garden…) that Gladys fills in line by
line. Everything stays on your local network: Gladys talks directly to your
BookStack.

Tested against a real BookStack v26.09.2 (the linuxserver.io Docker image).
Feedback welcome on the Gladys forum.

## Prerequisites

- Gladys Assistant 5.1 or later.
- BookStack reachable from the Gladys machine (any recent version; v24 or
  later recommended).
- An API token: in BookStack, open **My Account → Access & Security → API
  Tokens** and create one. Copy its **Token ID** and **Token Secret** (the
  secret is shown once). Its owner needs the **Access system API** permission
  (the Admin role has it; give it to another role in **Settings → Roles**), and
  the right to edit the books your scenes write in. The integration sees what
  this user sees.

## Configuration

1. Open the **Configuration** tab of the integration.
2. In **BookStack address**, enter the address you open BookStack at, for
   example `192.168.1.50:6875` or `https://wiki.example.org`.
3. Paste the **Token ID** and the **Token secret**.
4. **Read BookStack every**: 5, 15 (default), 30 or 60 minutes. Changed pages
   are announced at the next read.
5. **Language of names and messages** sets the feature names (fixed when a
   device is added) and the texts of the integration. French by default.
6. Save, then use **Test the connection**: it shows the number of books and
   pages.
7. In the **Discovery** tab, add the **BookStack** device, and the books you
   want to follow.

## Devices

**BookStack** (one device for the instance):

| Feature             | Value                                         |
| ------------------- | --------------------------------------------- |
| Books               | number of books                               |
| Shelves             | number of shelves                             |
| Pages               | number of pages                               |
| Pages changed today | pages created or saved since midnight         |
| Latest changed page | name of the page created or saved most lately |

**One device per book**, named like the book, with one feature, **Pages**: its
number of pages. Add only the ones you care about: they are the book filter of
the triggers and of the widget.

The counters keep their history.

## Dashboard widget

**BookStack**: three tiles (books, pages, today) and the eight pages changed
last, with their book and the time of the change. In the widget settings,
**Book** picks a book device: the widget then shows its number of pages and its
pages changed last. **Hide the counters** keeps the list only. When BookStack
is reached over https, each page opens in BookStack.

## Scene triggers

- **BookStack page created or updated**: a page is created or saved in
  BookStack. Filters: **Book** (pick a book device; empty: all) and **Change**
  (created, updated, or empty: both).
- **Tagged BookStack page changed**: the same, for the pages carrying a tag:
  **Tag** (required, the tag name exactly as written in BookStack, e.g.
  `journal`), **Book** and **Change**. A page with several tags fires once per
  tag name, so a scene set on one tag runs once.

Variables: **Page name**, **Book**, **Change** (`created` or `updated`),
**Page address**, **Updated by**, **Tags** (`name: value`, separated by
commas), **Page id**, and **Tag** for the second trigger.

The first read after the installation is silent: the pages already there are
not announced. The pages written by this integration are never announced. At
most ten pages are announced per read; the rest is counted as seen.

## Scene actions

- **Create a BookStack page**: **Book** (the name of an existing book, upper or
  lower case alike, or its id), **Page name**, and optionally **Content**
  (Markdown) and **Tags** (separated by commas, `name=value` for a tag with a
  value). An unknown book is an error: the integration never creates one.
- **Add a line to a BookStack page**: **Book**, **Page name** and **Line**. The
  line is added at the end of the page, as a new paragraph, starting with the
  date and time unless **Start with the date and time** is off. The page is
  created at its first line. Markdown pages take the line as Markdown, the
  others as plain text.

Both return **Page id**, **Page name**, **Book**, **Page address** and **Page
created**.

## Scene examples

- **Boiler log**: when the boiler pressure drops below 1 bar → **Add a line to
  a BookStack page**, book `House`, page `Boiler log`, line "Pressure below 1
  bar".
- **Know what changed**: trigger **BookStack page created or updated**, book
  **Procedures** → send a message "{{triggerEvent.data.updated_by}} updated
  {{triggerEvent.data.page_name}}".
- **Shopping list on the wiki**: trigger **Tagged BookStack page changed**, tag
  `shopping` → send the page address to the family.
- **Holiday report**: when the alarm is turned off after a holiday → **Create a
  BookStack page** in the book `House`, tagged `report`.

## Troubleshooting

- **"BookStack refused the API token"**: the token was deleted, has expired or
  was mistyped. Create a new one in My Account → Access & Security.
- **"The owner of the token may not use the API"**: give their role the
  **Access system API** permission in Settings → Roles.
- **"The owner of the token may not write in this book"**: give the user the
  edit permission on the book (or on all books) in BookStack.
- **"BookStack does not answer"**: check the address and the port from the
  Gladys machine. The container uses a bridge network: `localhost` is the
  container itself, enter the IP address of the server instead.
- **"This address does not answer like BookStack"**: a proxy login page answers
  instead of BookStack. Enter the address of BookStack itself.
- A book is missing from the trigger filter or the widget settings: add its
  device in the **Discovery** tab first.
- To see more in the logs of the integration, set `LOG_LEVEL=debug`.

## Limits

- One BookStack user: the owner of the token, with their permissions.
- The triggers fire at the next read (15 minutes by default), not instantly:
  BookStack pushes nothing. Pages deleted, moved or only commented are not
  announced; a page saved several times between two reads is announced once.
- A read costs a few requests, plus one per book added to Gladys and one per
  announced page: well under the 180 requests per minute BookStack allows.
- Discovery offers the first 100 books, in alphabetical order.
- The integration never deletes nor moves anything in BookStack.
- Not affiliated with BookStack.
