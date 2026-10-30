# BookStack

Verbinde Gladys mit [BookStack](https://www.bookstackapp.com), dem selbst
gehosteten Wiki aus Regalen, Büchern, Kapiteln und Seiten: Behalte deine Zähler
im Blick, reagiere, wenn eine Seite erstellt oder geändert wird, schreibe
Seiten aus deinen Szenen und führe ein Journal (Heizung, Alarmanlage,
Garten…), das Gladys Zeile für Zeile füllt. Alles bleibt in deinem lokalen
Netzwerk: Gladys spricht direkt mit deinem BookStack.

Getestet mit einem echten BookStack v26.09.2 (dem Docker-Image von
linuxserver.io). Rückmeldungen im Gladys-Forum sind willkommen.

## Voraussetzungen

- Gladys Assistant 5.1 oder neuer.
- BookStack, vom Gladys-Rechner aus erreichbar (jede aktuelle Version; v24 oder
  neuer empfohlen).
- Ein API-Token: Öffne in BookStack **Mein Account → Zugang & Sicherheit →
  API-Token** und erstelle eines. Kopiere seine **Token ID** und sein **Token
  Geheimnis** (das Geheimnis wird nur einmal angezeigt). Sein Besitzer braucht
  die Berechtigung **Systemzugriffs-API** (die Rolle Admin hat sie; gib sie
  einer anderen Rolle unter **Einstellungen → Rollen**) und das Recht, die
  Bücher zu bearbeiten, in die deine Szenen schreiben. Die Integration sieht,
  was dieser Benutzer sieht.

## Konfiguration

1. Öffne den Reiter **Konfiguration** der Integration.
2. Gib unter **BookStack-Adresse** die Adresse ein, unter der du BookStack
   öffnest, zum Beispiel `192.168.1.50:6875` oder `https://wiki.example.org`.
3. Füge **Token ID** und **Token Geheimnis** ein.
4. **BookStack lesen alle**: 5, 15 (Standard), 30 oder 60 Minuten. Geänderte
   Seiten werden beim nächsten Lesen gemeldet.
5. **Sprache der Namen und Meldungen** legt die Namen der Funktionen (beim
   Hinzufügen eines Geräts festgelegt) und die Texte der Integration fest.
   Standard: Französisch.
6. Speichere und nutze **Verbindung testen**: Der Test zeigt die Zahl der Bücher und
   Seiten.
7. Füge im Reiter **Erkennung** das Gerät **BookStack** und die Bücher hinzu,
   die du verfolgen willst.

## Geräte

**BookStack** (ein Gerät für die Instanz):

| Funktion                | Wert                                            |
| ----------------------- | ----------------------------------------------- |
| Bücher                  | Anzahl der Bücher                               |
| Regale                  | Anzahl der Regale                               |
| Seiten                  | Anzahl der Seiten                               |
| Heute geänderte Seiten  | seit Mitternacht erstellte oder gespeicherte    |
| Zuletzt geänderte Seite | Name der zuletzt erstellten/gespeicherten Seite |

**Ein Gerät pro Buch**, benannt wie das Buch, mit einer Funktion, **Seiten**:
seine Seitenzahl. Füge nur die hinzu, die dich interessieren: Diese dienen als
Buchfilter der Auslöser und des Widgets.

Die Zähler behalten ihren Verlauf.

## Dashboard-Widget

**BookStack**: drei Kacheln (Bücher, Seiten, heute) und die acht zuletzt
geänderten Seiten, mit ihrem Buch und der Uhrzeit der Änderung. In den
Widget-Einstellungen wählt **Buch** ein Buchgerät: Das Widget zeigt dann seine
Seitenzahl und seine zuletzt geänderten Seiten. **Zähler ausblenden** lässt nur
die Liste. Wird BookStack über https erreicht, öffnet sich jede Seite in
BookStack.

## Szenen-Auslöser

- **BookStack-Seite erstellt oder geändert**: Eine Seite wird in BookStack
  erstellt oder gespeichert. Filter: **Buch** (ein Buchgerät; leer: alle) und
  **Änderung** (erstellt, aktualisiert oder leer: beide).
- **Verschlagwortete BookStack-Seite geändert**: dasselbe für Seiten mit einem
  Schlagwort: **Schlagwort** (Pflicht, der Name genau wie in BookStack, z. B.
  `journal`), **Buch** und **Änderung**. Eine Seite mit mehreren Schlagwörtern
  löst einmal pro Schlagwortname aus: Eine Szene auf ein Schlagwort läuft
  einmal.

Variablen: **Seitenname**, **Buch**, **Änderung** (`created` oder `updated`),
**Adresse der Seite**, **Aktualisiert von**, **Schlagwörter** (`Name: Wert`,
durch Kommas getrennt), **Seiten-ID** und **Schlagwort** beim zweiten Auslöser.

Das erste Lesen nach der Installation ist still: Vorhandene Seiten werden nicht
gemeldet. Von dieser Integration geschriebene Seiten werden nie gemeldet.
Höchstens zehn Seiten werden pro Lesen gemeldet, die ältesten zuerst; die weiteren warten auf das nächste Lesen. Bei mehr als 50 Änderungen zwischen zwei Lesevorgängen (ein Import) werden zehn gemeldet, der Rest gilt als gesehen.

## Szenen-Aktionen

- **BookStack-Seite erstellen**: **Buch** (der Name eines vorhandenen Buchs,
  Groß- und Kleinschreibung egal, oder seine ID), **Seitenname** und optional
  **Inhalt** (Markdown) und **Schlagwörter** (durch Kommas getrennt,
  `Name=Wert` für ein Schlagwort mit Wert). Ein unbekanntes Buch ist ein
  Fehler: Die Integration legt nie eines an.
- **Zeile zu einer BookStack-Seite hinzufügen**: **Buch**, **Seitenname** und
  **Zeile**. Die Zeile wird am Ende der Seite als neuer Absatz angefügt, mit
  Datum und Uhrzeit davor, außer wenn **Mit Datum und Uhrzeit beginnen** aus
  ist. Die Seite wird bei ihrer ersten Zeile erstellt. Markdown-Seiten erhalten
  die Zeile als Markdown, die anderen als reinen Text.

Beide geben **Seiten-ID**, **Seitenname**, **Buch**, **Adresse der Seite** und
**Seite erstellt** zurück.

## Szenen-Beispiele

- **Heizungs-Journal**: Wenn der Heizungsdruck unter 1 bar fällt → **Zeile zu
  einer BookStack-Seite hinzufügen**, Buch `Haus`, Seite `Heizungs-Journal`,
  Zeile „Druck unter 1 bar“.
- **Wissen, was sich geändert hat**: Auslöser **BookStack-Seite erstellt oder
  geändert**, Buch **Abläufe** → Nachricht senden
  „{{triggerEvent.data.updated_by}} hat {{triggerEvent.data.page_name}}
  geändert“.
- **Einkaufsliste im Wiki**: Auslöser **Verschlagwortete BookStack-Seite
  geändert**, Schlagwort `einkauf` → die Adresse der Seite an die Familie
  senden.
- **Urlaubsbericht**: Wenn die Alarmanlage nach dem Urlaub ausgeschaltet wird →
  **BookStack-Seite erstellen** im Buch `Haus`, mit Schlagwort `bericht`.

## Fehlerbehebung

- **„BookStack hat das API-Token abgelehnt“**: Das Token wurde gelöscht, ist
  abgelaufen oder falsch eingegeben. Erstelle ein neues unter Mein Account →
  Zugang & Sicherheit.
- **„Der Besitzer des Tokens darf die API nicht nutzen“**: Gib seiner Rolle die
  Berechtigung **Systemzugriffs-API** unter Einstellungen → Rollen.
- **„Der Besitzer des Tokens darf in diesem Buch nicht schreiben“**: Gib dem
  Benutzer in BookStack das Bearbeitungsrecht für dieses Buch (oder alle).
- **„BookStack antwortet nicht“**: Prüfe Adresse und Port vom Gladys-Rechner
  aus. Der Container läuft in einem Bridge-Netzwerk: `localhost` ist der
  Container selbst, gib stattdessen die IP-Adresse des Servers ein.
- **„Diese Adresse antwortet nicht wie BookStack“**: Eine Anmeldeseite eines
  Proxys antwortet statt BookStack. Gib die Adresse von BookStack selbst ein.
- Ein Buch fehlt im Filter eines Auslösers oder in den Widget-Einstellungen:
  Füge zuerst sein Gerät im Reiter **Erkennung** hinzu.
- Für mehr Details in den Logs der Integration setze `LOG_LEVEL=debug`.

## Grenzen

- Ein BookStack-Benutzer: der Besitzer des Tokens, mit seinen Rechten.
- Die Auslöser feuern beim nächsten Lesen (standardmäßig 15 Minuten), nicht
  sofort: BookStack meldet nichts von sich aus. Gelöschte, verschobene oder nur
  kommentierte Seiten werden nicht gemeldet; eine zwischen zwei Lesevorgängen
  mehrmals gespeicherte Seite wird einmal gemeldet.
- Ein Lesen kostet einige Anfragen, plus eine pro zu Gladys hinzugefügtem Buch
  und eine pro gemeldeter Seite: weit unter den 180 Anfragen pro Minute, die
  BookStack erlaubt.
- Die Erkennung bietet die ersten 100 Bücher an, alphabetisch.
- Die Integration löscht und verschiebt nie etwas in BookStack.
- Nicht mit BookStack verbunden.
