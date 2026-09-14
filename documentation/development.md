# Développement

## Prérequis

- Node.js 20.19 ou supérieur ;
- npm ;
- PHP 8.1 ou supérieur dans WSL ;
- extensions PHP `curl`, `dom`, `libxml`, `session`, `pdo` et `pdo_sqlite`.

## Installation des dépendances

```bat
cd src
npm ci
cd ..
```

## Lancement local

```bat
rundev-global.bat
rundev-individuel.bat
```

Les deux scripts lancent Vite sur `http://localhost:5173` et l’API PHP sur `http://127.0.0.1:8787`.

- `rundev-global.bat` prépare et démarre le conteneur MySQL dédié, puis force le mode global ;
- `rundev-individuel.bat` force le mode personnel et écrit dans `php/data/pulsenotes.sqlite`, même si MySQL est installé ;
- `rundev.bat` propose un menu `Global` ou `Individuel`.

## MySQL global en un clic

Prérequis : Docker Desktop démarré et accessible depuis Windows.

```bat
install-dev-db.bat
```

Le script :

1. génère des secrets aléatoires dans `.dev/mysql.env` ;
2. télécharge l’image officielle MySQL 8.4 ;
3. démarre `pulsenotes-mysql-dev` sur `127.0.0.1:3307` ;
4. crée la base et l’utilisateur PulseNotes ;
5. attend que MySQL soit prêt.

`rundev-global.bat` appelle automatiquement cette installation au premier lancement, puis redémarre le même conteneur aux lancements suivants. Il n’est donc pas nécessaire d’exécuter `install-dev-db.bat` séparément, sauf pour préparer la base à l’avance.

La configuration est locale et ignorée par Git :

```dotenv
MYSQL_IMAGE=mysql:8.4
MYSQL_PORT=3307
MYSQL_DATABASE=pulsenotes
MYSQL_USER=pulsenotes
MYSQL_PASSWORD=...
MYSQL_ROOT_PASSWORD=...
PULSENOTES_APP_KEY=...
```

Les identifiants peuvent être choisis avant la première création en préparant `.dev/mysql.env`. Une fois le volume initialisé, modifier les mots de passe dans ce fichier ne modifie pas automatiquement les comptes déjà créés dans MySQL.

Commandes utiles :

```bat
docker compose --env-file .dev/mysql.env -f docker-compose.dev.yml stop
docker compose --env-file .dev/mysql.env -f docker-compose.dev.yml start
docker compose --env-file .dev/mysql.env -f docker-compose.dev.yml logs mysql
```

Les données restent dans le volume Docker `pulsenotes-dev_pulsenotes_mysql_data` entre deux démarrages.

Le jeu de démonstration ne nécessite pas de compte :

```text
http://localhost:5173/?demo=1
```

Le paramètre `demo=1` remplace les appels étudiants par un jeu de données fictif généré dans le navigateur. Il ne crée aucune session, n’écrit aucune note en base et peut être utilisé sur un build de production pour présenter l’interface.

Ajoutez `&debug` pour afficher les outils de test des états de note.

## Vérifications

```bat
cd src
npm run check
npm run security
cd ..
wsl php php/tests/router_test.php
php -l php/router.php
```

`npm run check` exécute les tests TypeScript, le contrôle de types et le build Vite.

## Construction

```bat
build-release.bat
build-release.bat main
build-release.bat individuel
```

Les sorties de développement (`src/dist`, `output`, `php/data` et `.playwright-cli`) sont ignorées par Git et ne doivent jamais être modifiées comme sources.

`output/qa/` contient uniquement les captures et rapports produits pendant les vérifications visuelles. Ce dossier peut être supprimé à tout moment ; il est recréé lors d’une nouvelle QA et n’est jamais inclus dans les distributions.

## Organisation du dépôt

```text
PulseNotes/
├── .dev/            Secrets MySQL locaux, ignorés par Git
├── deploy/          Points d’entrée propres à chaque édition
├── documentation/   Documentation maintenue
├── installer/       Installateur personnel o2switch
├── php/             Proxy, authentification et persistance
├── scripts/         Développement et construction des distributions
├── docker-compose.dev.yml  Base MySQL locale
├── install-dev-db.bat      Installation MySQL en un clic
├── rundev-global.bat       Frontend + API globale + MySQL Docker
├── rundev-individuel.bat   Frontend + API personnelle SQLite
└── src/             Application React, tests et génération PDF
```

Dans `src/src/` :

- `components/` contient les composants partagés ;
- `pages/` contient les vues principales et la page publique ;
- `lib/` contient API, normalisation, calculs et navigation ;
- `pdf/` et `components/pdf/` contiennent le modèle de bulletin.

## Conventions

- composants et pages React en `PascalCase` ;
- fonctions, hooks et variables en `camelCase` ;
- composants de présentation sans connaissance directe des endpoints ScoDoc ;
- valeurs absentes représentées par `null`, jamais par un faux zéro ;
- changement fonctionnel accompagné du test et de la documentation concernés.
