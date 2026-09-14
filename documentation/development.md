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
rundev.bat
```

Le script lance Vite sur `http://localhost:5173` et l’API PHP sur `http://127.0.0.1:8787`.

Le jeu de démonstration ne nécessite pas de compte :

```text
http://localhost:5173/?demo=1
```

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

## Organisation du dépôt

```text
PulseNotes/
├── deploy/          Points d’entrée propres à chaque édition
├── documentation/   Documentation maintenue
├── installer/       Installateur personnel o2switch
├── php/             Proxy, authentification et persistance
├── scripts/         Construction des distributions
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
