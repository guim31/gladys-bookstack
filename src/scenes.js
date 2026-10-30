// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`): create a page in a book — a
// report, a note dictated to a voice scene — or add a line at the end of a
// "journal" page (created at its first line): a log of the boiler, of the
// alarm, of the garden, written by Gladys in the wiki.
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  async create_page(hub, { fields = {} }) {
    return hub.createPage({
      book: fields.book,
      name: fields.name,
      content: fields.content,
      tags: fields.tags,
    });
  },
  async append_line(hub, { fields = {} }) {
    return hub.appendToPage({
      book: fields.book,
      page: fields.page,
      line: fields.line,
      addTime: fields.add_time,
    });
  },
};
