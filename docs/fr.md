# BookStack

Connectez Gladys à [BookStack](https://www.bookstackapp.com), le wiki
auto-hébergé organisé en étagères, livres, chapitres et pages : suivez vos
compteurs, réagissez quand une page est créée ou modifiée, écrivez des pages
depuis vos scènes, et tenez un journal (la chaudière, l'alarme, le jardin…) que
Gladys remplit ligne par ligne. Tout reste sur votre réseau local : Gladys
parle directement à votre BookStack.

Testée contre un vrai BookStack v26.09.2 (l'image Docker de linuxserver.io).
Vos retours sont les bienvenus sur le forum Gladys.

## Prérequis

- Gladys Assistant 5.1 ou plus.
- BookStack joignable depuis la machine de Gladys (toute version récente ; v24
  ou plus conseillée).
- Un jeton d'API : dans BookStack, ouvrez **Mon compte → Accès et sécurité →
  Jetons API** et créez-en un. Copiez son **Token ID** et son **Token Secret**
  (le secret n'est affiché qu'une fois). Son propriétaire doit avoir la
  permission **Accès à l'API du système** (le rôle Admin l'a ; donnez-la à un
  autre rôle dans **Préférences → Rôles**), et le droit de modifier les livres
  où vos scènes écrivent. L'intégration voit ce que voit cet utilisateur.

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Dans **Adresse de BookStack**, saisissez l'adresse à laquelle vous ouvrez
   BookStack, par exemple `192.168.1.50:6875` ou `https://wiki.example.org`.
3. Collez l'**ID du jeton** et le **Secret du jeton**.
4. **Lire BookStack toutes les** : 5, 15 (par défaut), 30 ou 60 minutes. Les
   pages modifiées sont annoncées à la lecture suivante.
5. **Langue des noms et messages** fixe le nom des fonctionnalités (figé à
   l'ajout d'un appareil) et les textes de l'intégration. Français par défaut.
6. Enregistrez, puis utilisez **Tester la connexion** : elle affiche le nombre
   de livres et de pages.
7. Dans l'onglet **Découverte**, ajoutez l'appareil **BookStack**, et les
   livres que vous voulez suivre.

## Appareils

**BookStack** (un appareil pour l'instance) :

| Fonctionnalité              | Valeur                                         |
| --------------------------- | ---------------------------------------------- |
| Livres                      | nombre de livres                               |
| Étagères                    | nombre d'étagères                              |
| Pages                       | nombre de pages                                |
| Pages modifiées aujourd'hui | pages créées ou enregistrées depuis minuit     |
| Dernière page modifiée      | nom de la page créée ou enregistrée en dernier |

**Un appareil par livre**, au nom du livre, avec une fonctionnalité,
**Pages** : son nombre de pages. N'ajoutez que ceux qui vous intéressent : ils
servent de filtre de livre aux déclencheurs et au widget.

Les compteurs gardent leur historique.

## Widget du tableau de bord

**BookStack** : trois tuiles (livres, pages, aujourd'hui) et les huit pages
modifiées en dernier, avec leur livre et l'heure du changement. Dans les
réglages du widget, **Livre** choisit un appareil livre : le widget affiche
alors son nombre de pages et ses dernières pages modifiées. **Masquer les
compteurs** ne garde que la liste. Quand BookStack est joint en https, chaque
page s'ouvre dans BookStack.

## Déclencheurs de scène

- **Page BookStack créée ou modifiée** : une page est créée ou enregistrée dans
  BookStack. Filtres : **Livre** (un appareil livre ; vide : tous) et
  **Changement** (créée, modifiée, ou vide : les deux).
- **Page BookStack étiquetée modifiée** : la même chose, pour les pages qui
  portent une étiquette : **Étiquette** (obligatoire, le nom de l'étiquette
  exactement comme dans BookStack, ex. `journal`), **Livre** et **Changement**.
  Une page à plusieurs étiquettes se déclenche une fois par nom d'étiquette :
  une scène réglée sur une étiquette s'exécute une fois.

Variables : **Nom de la page**, **Livre**, **Changement** (`created` ou
`updated`), **Adresse de la page**, **Modifiée par**, **Étiquettes**
(`nom: valeur`, séparées par des virgules), **Identifiant de la page**, et
**Étiquette** pour le second déclencheur.

La première lecture après l'installation est silencieuse : les pages déjà là ne
sont pas annoncées. Les pages écrites par cette intégration ne sont jamais
annoncées. Dix pages au plus sont annoncées par lecture ; le reste est compté
comme vu.

## Actions de scène

- **Créer une page BookStack** : **Livre** (le nom d'un livre existant,
  majuscules ou minuscules indifféremment, ou son identifiant), **Nom de la
  page**, et en option **Contenu** (Markdown) et **Étiquettes** (séparées par
  des virgules, `nom=valeur` pour une étiquette avec valeur). Un livre inconnu
  est une erreur : l'intégration n'en crée jamais.
- **Ajouter une ligne à une page BookStack** : **Livre**, **Nom de la page** et
  **Ligne**. La ligne est ajoutée à la fin de la page, en nouveau paragraphe,
  précédée de la date et de l'heure sauf si **Commencer par la date et
  l'heure** est désactivé. La page est créée à sa première ligne. Une page
  Markdown reçoit la ligne en Markdown, les autres en texte brut.

Les deux renvoient **Identifiant de la page**, **Nom de la page**, **Livre**,
**Adresse de la page** et **Page créée**.

## Exemples de scènes

- **Journal de la chaudière** : quand la pression de la chaudière passe sous
  1 bar → **Ajouter une ligne à une page BookStack**, livre `Maison`, page
  `Journal de la chaudière`, ligne « Pression sous 1 bar ».
- **Savoir ce qui a changé** : déclencheur **Page BookStack créée ou
  modifiée**, livre **Procédures** → envoyer un message
  « {{triggerEvent.data.updated_by}} a modifié
  {{triggerEvent.data.page_name}} ».
- **Liste de courses sur le wiki** : déclencheur **Page BookStack étiquetée
  modifiée**, étiquette `courses` → envoyer l'adresse de la page à la famille.
- **Compte rendu de vacances** : quand l'alarme est désactivée au retour →
  **Créer une page BookStack** dans le livre `Maison`, étiquetée `rapport`.

## Dépannage

- **« BookStack a refusé le jeton d'API »** : le jeton a été supprimé, a expiré
  ou a été mal saisi. Créez-en un nouveau dans Mon compte → Accès et sécurité.
- **« Le propriétaire du jeton n'a pas accès à l'API »** : donnez à son rôle la
  permission **Accès à l'API du système** dans Préférences → Rôles.
- **« Le propriétaire du jeton ne peut pas écrire dans ce livre »** : donnez à
  l'utilisateur le droit de modifier ce livre (ou tous les livres) dans
  BookStack.
- **« BookStack ne répond pas »** : vérifiez l'adresse et le port depuis la
  machine de Gladys. Le conteneur est sur un réseau en pont : `localhost` est le
  conteneur lui-même, saisissez plutôt l'adresse IP du serveur.
- **« Cette adresse ne répond pas comme BookStack »** : une page de connexion
  d'un proxy répond à la place de BookStack. Saisissez l'adresse de BookStack
  lui-même.
- Un livre manque dans le filtre d'un déclencheur ou les réglages du widget :
  ajoutez d'abord son appareil dans l'onglet **Découverte**.
- Pour plus de détails dans les journaux de l'intégration, réglez
  `LOG_LEVEL=debug`.

## Limites

- Un seul utilisateur BookStack : le propriétaire du jeton, avec ses droits.
- Les déclencheurs partent à la lecture suivante (15 minutes par défaut), pas
  instantanément : BookStack ne pousse rien. Les pages supprimées, déplacées ou
  seulement commentées ne sont pas annoncées ; une page enregistrée plusieurs
  fois entre deux lectures est annoncée une fois.
- Une lecture coûte quelques requêtes, plus une par livre ajouté à Gladys et
  une par page annoncée : bien moins que les 180 requêtes par minute permises
  par BookStack.
- La découverte propose les 100 premiers livres, par ordre alphabétique.
- L'intégration ne supprime ni ne déplace jamais rien dans BookStack.
- Sans lien avec BookStack.
