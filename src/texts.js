// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface, with the words of the BookStack interface (fr "livre",
// "étagère", "étiquette", de "Buch", "Regal", "Schlagwort", es "libro",
// "estante", "etiqueta"). German says "du", Spanish "usted"
// (test/i18n.test.js).
// -----------------------------------------------------------------------------

// Feature names (frozen by Gladys at creation).
export const NAMES = {
  en: {
    books: 'Books',
    shelves: 'Shelves',
    pages: 'Pages',
    today: 'Pages changed today',
    latest: 'Latest changed page',
  },
  fr: {
    books: 'Livres',
    shelves: 'Étagères',
    pages: 'Pages',
    today: "Pages modifiées aujourd'hui",
    latest: 'Dernière page modifiée',
  },
  de: {
    books: 'Bücher',
    shelves: 'Regale',
    pages: 'Seiten',
    today: 'Heute geänderte Seiten',
    latest: 'Zuletzt geänderte Seite',
  },
  es: {
    books: 'Libros',
    shelves: 'Estantes',
    pages: 'Páginas',
    today: 'Páginas modificadas hoy',
    latest: 'Última página modificada',
  },
};

/** The "Latest changed page" text of an empty BookStack. */
export const NONE = { en: 'None', fr: 'Aucune', de: 'Keine', es: 'Ninguna' };

export const STATUS_TEXT = {
  en: {
    none: 'Enter the address of BookStack and an API token in the configuration.',
    invalid: 'The BookStack address is not valid: enter an address like 192.168.1.50:6875.',
    token: 'Enter the token ID and the token secret (BookStack → My Account → Access & Security).',
    unauthorized: 'BookStack refused the API token: check its ID, its secret and its expiry date.',
    no_api:
      'The owner of the token may not use the API: give their role the "Access system API" permission.',
    unreachable: 'BookStack does not answer: check its address and that it is running.',
    error: 'BookStack answered with an error: see the logs of the integration.',
    invalid_answer: 'This address does not answer like BookStack: check the address and the port.',
  },
  fr: {
    none: "Saisissez l'adresse de BookStack et un jeton d'API dans la configuration.",
    invalid:
      "L'adresse de BookStack n'est pas valide : saisissez une adresse comme 192.168.1.50:6875.",
    token: "Saisissez l'ID et le secret du jeton (BookStack → Mon compte → Accès et sécurité).",
    unauthorized:
      "BookStack a refusé le jeton d'API : vérifiez son ID, son secret et sa date d'expiration.",
    no_api:
      "Le propriétaire du jeton n'a pas accès à l'API : donnez à son rôle la permission « Accès à l'API du système ».",
    unreachable: "BookStack ne répond pas : vérifiez son adresse et qu'il est démarré.",
    error: "BookStack a répondu par une erreur : consultez les journaux de l'intégration.",
    invalid_answer: "Cette adresse ne répond pas comme BookStack : vérifiez l'adresse et le port.",
  },
  de: {
    none: 'Gib in der Konfiguration die Adresse von BookStack und ein API-Token ein.',
    invalid: 'Die BookStack-Adresse ist ungültig: Gib eine Adresse wie 192.168.1.50:6875 ein.',
    token: 'Gib Token ID und Token Geheimnis ein (BookStack → Mein Account → Zugang & Sicherheit).',
    unauthorized: 'BookStack hat das API-Token abgelehnt: Prüfe ID, Geheimnis und Ablaufdatum.',
    no_api:
      'Der Besitzer des Tokens darf die API nicht nutzen: Gib seiner Rolle die Berechtigung „Systemzugriffs-API“.',
    unreachable: 'BookStack antwortet nicht: Prüfe die Adresse und ob es läuft.',
    error: 'BookStack hat mit einem Fehler geantwortet: Sieh dir die Logs der Integration an.',
    invalid_answer: 'Diese Adresse antwortet nicht wie BookStack: Prüfe Adresse und Port.',
  },
  es: {
    none: 'Introduzca la dirección de BookStack y un token de API en la configuración.',
    invalid:
      'La dirección de BookStack no es válida: introduzca una dirección como 192.168.1.50:6875.',
    token: 'Introduzca el ID y el secreto del token (BookStack → Mi cuenta → Acceso y seguridad).',
    unauthorized:
      'BookStack rechazó el token de API: compruebe su ID, su secreto y su fecha de caducidad.',
    no_api:
      'El propietario del token no puede usar la API: dé a su rol el permiso «API de sistema de acceso».',
    unreachable: 'BookStack no responde: compruebe su dirección y que esté en marcha.',
    error: 'BookStack respondió con un error: consulte los registros de la integración.',
    invalid_answer:
      'Esta dirección no responde como BookStack: compruebe la dirección y el puerto.',
  },
};

/** "Test the connection" once BookStack answered. */
export const TEST_TEXT = {
  en: (books, pages) => `Connected to BookStack: ${books} book(s), ${pages} page(s).`,
  fr: (books, pages) => `Connecté à BookStack : ${books} livre(s), ${pages} page(s).`,
  de: (books, pages) => `Mit BookStack verbunden: ${books} Buch/Bücher, ${pages} Seite(n).`,
  es: (books, pages) => `Conectado a BookStack: ${books} libro(s), ${pages} página(s).`,
};

export const INIT_FAILED = {
  en: 'The integration could not start: see its logs.',
  fr: "L'intégration n'a pas pu démarrer : consultez ses journaux.",
  de: 'Die Integration konnte nicht starten: Sieh dir ihre Logs an.',
  es: 'La integración no pudo iniciarse: consulte sus registros.',
};

// Errors of the scene actions. `{name}` is a book or page name, `{detail}`
// the reason BookStack gave.
export const COMMAND_ERRORS = {
  en: {
    timeout: 'BookStack answered too late: the page may have been written anyway.',
    http: 'BookStack could not write the page: {detail}',
    unreachable: 'BookStack does not answer: nothing was done.',
    unauthorized: 'BookStack refused the API token: nothing was done.',
    forbidden: 'The owner of the token may not write in this book: nothing was done.',
    book: 'No book "{name}" in BookStack.',
    book_missing: 'Enter the name of a book.',
    name: 'Enter the name of the page.',
    line: 'Enter the line to add.',
    rejected: 'BookStack refused the page: {detail}',
  },
  fr: {
    timeout: 'BookStack a répondu trop tard : la page a peut-être été écrite quand même.',
    http: "BookStack n'a pas pu écrire la page : {detail}",
    unreachable: "BookStack ne répond pas : rien n'a été fait.",
    unauthorized: "BookStack a refusé le jeton d'API : rien n'a été fait.",
    forbidden: "Le propriétaire du jeton ne peut pas écrire dans ce livre : rien n'a été fait.",
    book: 'Aucun livre « {name} » dans BookStack.',
    book_missing: "Saisissez le nom d'un livre.",
    name: 'Saisissez le nom de la page.',
    line: 'Saisissez la ligne à ajouter.',
    rejected: 'BookStack a refusé la page : {detail}',
  },
  de: {
    timeout: 'BookStack hat zu spät geantwortet: Die Seite wurde vielleicht trotzdem geschrieben.',
    http: 'BookStack konnte die Seite nicht schreiben: {detail}',
    unreachable: 'BookStack antwortet nicht: Es wurde nichts getan.',
    unauthorized: 'BookStack hat das API-Token abgelehnt: Es wurde nichts getan.',
    forbidden:
      'Der Besitzer des Tokens darf in diesem Buch nicht schreiben: Es wurde nichts getan.',
    book: 'Kein Buch „{name}“ in BookStack.',
    book_missing: 'Gib den Namen eines Buchs ein.',
    name: 'Gib den Namen der Seite ein.',
    line: 'Gib die hinzuzufügende Zeile ein.',
    rejected: 'BookStack hat die Seite abgelehnt: {detail}',
  },
  es: {
    timeout:
      'BookStack respondió demasiado tarde: puede que la página se haya escrito de todos modos.',
    http: 'BookStack no pudo escribir la página: {detail}',
    unreachable: 'BookStack no responde: no se ha hecho nada.',
    unauthorized: 'BookStack rechazó el token de API: no se ha hecho nada.',
    forbidden: 'El propietario del token no puede escribir en este libro: no se ha hecho nada.',
    book: 'No hay ningún libro «{name}» en BookStack.',
    book_missing: 'Introduzca el nombre de un libro.',
    name: 'Introduzca el nombre de la página.',
    line: 'Introduzca la línea que desea añadir.',
    rejected: 'BookStack rechazó la página: {detail}',
  },
};

/** A coded message in every language, details filled in. */
export function commandMessage(code, values = {}) {
  return Object.fromEntries(
    Object.entries(COMMAND_ERRORS).map(([language, table]) => [
      language,
      (table[code] ?? table.unreachable)
        .replace('{name}', values.name ?? '')
        .replace('{detail}', values.detail ?? '')
        .slice(0, 200),
    ]),
  );
}

export const pick = (table, language) => table[language] ?? table.en;
