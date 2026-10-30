// -----------------------------------------------------------------------------
// The "BookStack" dashboard widget: counters (books, pages, pages changed
// today — or the pages of the book set in the widget) and the pages changed
// last, each one opening in BookStack. Set to a book, it lists that book.
// -----------------------------------------------------------------------------

import { WIDGET_KEY } from './hub.js';
import { NAMES, pick } from './texts.js';

// The core shows 8 items at most in a `list` card-list.
export const MAX_ITEMS = 8;

export const TEXT = {
  today: { en: 'Today', fr: "Aujourd'hui", de: 'Heute', es: 'Hoy' },
  open: {
    en: 'Open in BookStack',
    fr: 'Ouvrir dans BookStack',
    de: 'In BookStack öffnen',
    es: 'Abrir en BookStack',
  },
  empty: {
    en: 'No page to show yet.',
    fr: 'Aucune page à afficher pour le moment.',
    de: 'Noch keine Seite anzuzeigen.',
    es: 'Todavía no hay ninguna página que mostrar.',
  },
  unavailable: {
    en: 'BookStack does not answer right now.',
    fr: 'BookStack ne répond pas pour le moment.',
    de: 'BookStack antwortet gerade nicht.',
    es: 'BookStack no responde en este momento.',
  },
  waiting: {
    en: 'Waiting for BookStack: check the configuration of the integration.',
    fr: "En attente de BookStack : vérifiez la configuration de l'intégration.",
    de: 'Warte auf BookStack: Prüfe die Konfiguration der Integration.',
    es: 'Esperando a BookStack: compruebe la configuración de la integración.',
  },
};

const cut = (text, max) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);
const https = (url) => typeof url === 'string' && /^https:\/\//i.test(url);

function shortDate(iso, language) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString(
    { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' }[language] ?? 'en-GB',
    { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
  );
}

/** One row of the list; the book is shown when the widget lists them all. */
export function pageItem(page, language, showBook) {
  const item = {
    title: cut(page.name, 60),
    subtitle: cut(
      [showBook ? page.book : '', shortDate(page.updated, language)].filter(Boolean).join(' · '),
      60,
    ),
  };
  // The links of a card must be https: a BookStack on plain http is left out.
  if (https(page.url)) {
    item.links = [{ url: page.url.slice(0, 2000), label: pick(TEXT.open, language) }];
  }
  return item;
}

const truthy = (value) => value === true || value === 'true';

export async function buildContent(hub, { language = 'en', settings = {} } = {}) {
  if (!hub.loaded) {
    return {
      ttl_seconds: 60,
      components: [{ type: 'text', variant: 'body', text: pick(TEXT.waiting, language) }],
    };
  }
  const book = hub.bookOf(settings?.book);
  const names = pick(NAMES, language);
  const pages = await hub.widgetPages(book, MAX_ITEMS);
  const components = [];
  if (!truthy(settings?.hide_counters)) {
    if (book) {
      const total = hub.bookPages.get(book.id) ?? hub.widgetLists.get(book.id)?.total;
      if (Number.isInteger(total)) {
        components.push({ type: 'value', label: cut(book.label, 24), value: total, icon: 'book' });
      }
    } else {
      components.push(
        { type: 'value', label: names.books, value: hub.counters.books, icon: 'book' },
        { type: 'value', label: names.pages, value: hub.counters.pages, icon: 'file-text' },
        {
          type: 'value',
          label: pick(TEXT.today, language),
          value: hub.counters.today,
          icon: 'edit-3',
        },
      );
    }
  }
  if (pages === null) {
    components.push({ type: 'text', variant: 'caption', text: pick(TEXT.unavailable, language) });
  } else if (pages.length === 0) {
    components.push({ type: 'text', variant: 'caption', text: pick(TEXT.empty, language) });
  } else {
    components.push({
      type: 'card-list',
      display: 'list',
      items: pages.map((p) => pageItem(p, language, !book)),
    });
  }
  // The hub nudges the widget after every read and every write.
  return { ttl_seconds: 300, components };
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    get: (hub, request) => buildContent(hub, request),
  },
};
