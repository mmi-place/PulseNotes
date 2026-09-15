<p align="center">
  <img src=".github/assets/banner.svg" alt="PulseNotes - Notes UVSQ, statistiques de promotion et bulletins PDF">
</p>

<p align="center">
  <a href="https://pulsenotes.mmi.place"><strong>Ouvrir PulseNotes</strong></a>
  ·
  <a href="documentation/installation.md">Installer</a>
  ·
  <a href="documentation/README.md">Documentation</a>
  ·
  <a href="php/README.md">API PHP</a>
  ·
  <a href="https://github.com/mmi-place/PulseNotes/releases">Releases</a>
</p>

<p align="center">
  <a href="https://github.com/mmi-place/PulseNotes/actions/workflows/release.yml"><img alt="Build et release" src="https://github.com/mmi-place/PulseNotes/actions/workflows/release.yml/badge.svg"></a>
  <a href="https://github.com/mmi-place/PulseNotes/releases"><img alt="Derniere release" src="https://img.shields.io/github/v/release/mmi-place/PulseNotes?include_prereleases&label=release"></a>
  <img alt="Frontend React" src="https://img.shields.io/badge/frontend-React-149ECA">
  <img alt="Proxy PHP" src="https://img.shields.io/badge/proxy-PHP-777BB4">
  <img alt="Stockage" src="https://img.shields.io/badge/storage-MySQL%20%7C%20SQLite-0F766E">
</p>

## Ce que fait PulseNotes

PulseNotes est une interface alternative pour consulter les résultats universitaires UVSQ avec une lecture plus claire des notes, des statistiques de promotion, du suivi des changements et des exports PDF personnalisés.

Le navigateur ne contacte jamais directement CAS ou Bulletins UVSQ. Toutes les connexions passent par un proxy PHP côté serveur, ce qui permet de proposer deux usages propres: un service global partagé et une installation personnelle auto-hébergée.

Le service global expose aussi l’installateur personnel via `https://pulsenotes.mmi.place/install.sh`, utilisable depuis le Terminal cPanel o2switch.

## Accès et éditions

| Besoin | Edition recommandée | Lien ou paquet | Stockage |
| --- | --- | --- | --- |
| Utiliser le service partagé | Globale | <https://pulsenotes.mmi.place> | MySQL ou PostgreSQL |
| Héberger pour soi | Personnelle | `pulsenotes-personal.zip` | SQLite |
| Déployer un service administré | Globale | `pulsenotes-global.zip` | MySQL ou PostgreSQL |

| Edition | Usage | Mot de passe UVSQ |
| --- | --- | --- |
| **Globale** | Plusieurs étudiants, sessions séparées | Jamais enregistré |
| **Personnelle** | Un seul étudiant, accès local par PIN, schéma ou mot de passe | Chiffré sur l’installation privée |

Les deux éditions partagent le même frontend React et le même coeur PHP. Leur point d’entrée impose le mode de déploiement afin d’éviter toute configuration ambiguë.

## Fonctionnalités

- synthèse par semestre, année ou parcours complet;
- notes par module ou en liste filtrable;
- rangs, min/moyenne/max et distributions chargés à la demande;
- détection des notes nouvelles ou modifiées;
- analyses par UE, module et période;
- bulletins officiels et exports PDF PulseNotes;
- liens publics révocables pour présenter une note unique en installation personnelle;
- navigation clavier, accessibilité et interface mobile dédiée.
- mises à jour stables déclenchées naturellement par l’application, sans tâche cron.

## Démarrage local

Prérequis: Node.js 20.19 ou supérieur, npm, WSL, PHP 8.1 ou supérieur et Docker Desktop pour le mode global.

```bat
rundev-global.bat
rundev-individuel.bat
```

`rundev-global.bat` démarre Docker et le conteneur MySQL dédié. `rundev-individuel.bat` utilise SQLite localement. `rundev.bat` affiche un menu permettant de choisir le mode au lancement.

| Service | Adresse |
| --- | --- |
| Application | <http://localhost:5173> |
| API locale | <http://127.0.0.1:8787> |
| Mode démonstration | <http://localhost:5173/?demo=1> |

## Construire les distributions

```bat
build-release.bat
```

Les livrables sont générés directement dans `output/`.

```text
output/
├── global/
├── personal/
├── install-personal-o2switch.sh
├── pulsenotes-global.zip
├── pulsenotes-global.zip.sha256
├── pulsenotes-personal.zip
└── pulsenotes-personal.zip.sha256
```

Chaque push sur `main` publie une prerelease GitHub avec les deux ZIP et l’installateur o2switch. Si la version de `src/package.json` change, le workflow publie automatiquement une release versionnée `vX.Y.Z`. Les tags `v*` explicites publient également une release versionnée.

## Documentation

| Guide | Contenu |
| --- | --- |
| [Centre de documentation](documentation/README.md) | Index de tous les guides |
| [Installation](documentation/installation.md) | Déploiement global, personnel et o2switch |
| [Développement](documentation/development.md) | Environnement, commandes et structure |
| [Architecture](documentation/architecture.md) | Flux applicatifs et séparation des éditions |
| [Fonctionnalités](documentation/features.md) | Produit, pages, PDF et partage |
| [Données](documentation/data.md) | Sources, calculs et valeurs absentes |
| [Sécurité](documentation/security.md) | Sessions, chiffrement, rétention et partages |
| [Interface](documentation/interface.md) | Responsive, accessibilité et composants |
| [Livraison](documentation/release.md) | Contrôles et génération des archives |
| [Référence API](php/README.md) | Routes et paramètres du proxy PHP |

Le Wiki GitHub sert de porte d’entrée courte et renvoie vers ces documents maintenus dans le dépôt.

## Statut

PulseNotes est en développement actif. Avant un déploiement public, utilisez un compte UVSQ de test, configurez HTTPS et appliquez la checklist de [livraison](documentation/release.md).
