# PulseNotes

Interface alternative pour consulter les résultats universitaires UVSQ : notes, statistiques de promotion, suivi des changements et bulletins PDF personnalisés.

PulseNotes utilise un frontend React et un proxy PHP. Le navigateur communique uniquement avec l’API de l’installation ; l’authentification CAS et les appels à Bulletins restent côté serveur.

## Fonctionnalités

- synthèse par semestre, année ou parcours complet ;
- notes regroupées par module ou présentées en liste ;
- rangs et distributions chargés à la demande ;
- détection des notes nouvelles ou modifiées ;
- analyses par UE, module et période ;
- bulletins officiels et exports PDF PulseNotes ;
- liens publics révocables pour une note unique ;
- navigation clavier et interface mobile dédiée.

## Deux éditions

| Édition | Usage | Stockage | Mot de passe UVSQ |
| --- | --- | --- | --- |
| **Globale** | Service partagé entre plusieurs étudiants | MySQL ou PostgreSQL | Jamais enregistré |
| **Personnelle** | Installation privée pour un étudiant | SQLite | Chiffré localement |

Les deux éditions partagent le même frontend et le même cœur PHP. Leur point d’entrée impose le mode de déploiement afin d’éviter toute configuration ambiguë.

## Démarrage rapide

Prérequis : Node.js 20.19 ou supérieur, npm, WSL et PHP 8.1 ou supérieur.

```bat
rundev.bat
```

| Service | Adresse |
| --- | --- |
| Application | <http://localhost:5173> |
| API locale | <http://127.0.0.1:8787> |
| Mode démonstration | <http://localhost:5173/?demo=1> |

## Construire les distributions

```bat
build-release.bat
```

Les archives globale et personnelle, accompagnées de leur empreinte SHA-256, sont créées dans `output/releases/`.

Les sous-dossiers `global/` et `personal/` sont les versions décompressées prêtes à téléverser. Les ZIP contiennent exactement le même contenu. Le dossier `output/qa/`, lorsqu’il existe, ne contient que les captures de validation et n’est jamais publié.

```bat
build-release.bat main
build-release.bat individuel
```

Ces deux variantes construisent uniquement l’édition demandée.

## Documentation

| Guide | Contenu |
| --- | --- |
| [Centre de documentation](documentation/README.md) | Index de tous les guides |
| [Installation](documentation/installation.md) | Déploiement global et personnel |
| [Développement](documentation/development.md) | Environnement, commandes et structure |
| [Architecture](documentation/architecture.md) | Flux applicatifs et séparation des éditions |
| [Sécurité](documentation/security.md) | Sessions, chiffrement, rétention et partages |
| [Référence API](php/README.md) | Routes et paramètres du proxy PHP |

## Statut

Le projet est en développement actif. Avant un déploiement public, utilisez un compte UVSQ de test, configurez HTTPS et appliquez la checklist de [livraison](documentation/release.md).
