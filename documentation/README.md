# Documentation PulseNotes

Cette documentation décrit l’application actuelle. Les anciennes pistes d’extension navigateur et les plans de refonte terminés ne font plus partie de la documentation maintenue.

Service global public : <https://pulsenotes.mmi.place>

## Commencer

1. [Installer PulseNotes](installation.md)
2. [Préparer l’environnement de développement](development.md)
3. [Comprendre l’architecture](architecture.md)

## Guides

| Document | Public concerné | Sujet |
| --- | --- | --- |
| [Installation](installation.md) | Administrateur | Éditions globale et personnelle, o2switch, configuration |
| [Développement](development.md) | Contributeur | Lancement local, tests, build et organisation du dépôt |
| [Architecture](architecture.md) | Développeur | Frontend, proxy, CAS, stockage et flux de données |
| [Fonctionnalités](features.md) | Produit et support | Pages, notes, statistiques, PDF et partage |
| [Données](data.md) | Développeur et produit | Sources, calculs, valeurs absentes et rapprochement |
| [Sécurité](security.md) | Administrateur et développeur | Chiffrement, sessions, rétention et limites |
| [Interface](interface.md) | Développeur frontend | Responsive, accessibilité, navigation et composants |
| [Livraison](release.md) | Mainteneur | Contrôles et génération des archives |
| [API PHP](../php/README.md) | Développeur backend | Routes HTTP et variables de configuration |

## Principes de maintenance

- documenter uniquement le comportement réellement disponible ;
- mettre à jour le guide concerné dans la même modification que le code ;
- réserver les idées non décidées aux issues GitHub, pas à la documentation de référence ;
- utiliser des chemins relatifs pour que tous les liens fonctionnent sur GitHub ;
- ne jamais placer de secret, cookie ou donnée étudiante réelle dans un exemple.
