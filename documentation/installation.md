# Installation

PulseNotes existe en deux éditions. Choisissez l’édition avant de préparer l’hébergement.

## Choisir une édition

| | Globale | Personnelle |
| --- | --- | --- |
| Utilisateurs | Plusieurs | Un seul |
| Base de données | MySQL ou PostgreSQL | SQLite |
| Connexion | Identifiants UVSQ à chaque nouvelle session | PIN, schéma ou mot de passe local après configuration |
| Mot de passe UVSQ | Jamais stocké | Chiffré sur l’installation privée |
| Hébergement visé | Serveur administré | Hébergement personnel, notamment o2switch |

## Construire les paquets

Depuis Windows :

```bat
build-release.bat
```

Le script crée :

- `output/releases/pulsenotes-global.zip` ;
- `output/releases/pulsenotes-personal.zip` ;
- un fichier `.sha256` pour chaque archive ;
- `output/releases/install-personal-o2switch.sh`.

## Installation personnelle sur o2switch

L’installateur cible le Terminal cPanel. Il télécharge l’archive, vérifie son empreinte, crée le sous-domaine `pulsenotes`, génère la clé applicative et protège SQLite.

```bash
bash install-personal-o2switch.sh
```

L’URL de téléchargement par défaut peut être remplacée :

```bash
PULSENOTES_RELEASE_URL="https://example.org/pulsenotes-personal.zip" \
  bash install-personal-o2switch.sh
```

Une fois HTTPS actif, ouvrez le sous-domaine et suivez l’assistant : vérification du compte UVSQ, puis choix d’un PIN, d’un schéma ou d’un mot de passe local.

### Mise à jour personnelle

Le paquet personnel contient `api/update.sh`. Le script préserve `api/config.php` et `api/data/`, qui contient la base SQLite.

Avant une mise à jour :

1. sauvegarder le dossier de l’installation ;
2. vérifier l’URL et l’empreinte de la nouvelle archive ;
3. exécuter l’updater depuis le compte d’hébergement ;
4. contrôler `/api/status` et ouvrir l’application.

## Installation globale

Prérequis serveur :

- PHP 8.1 ou supérieur avec `curl`, `dom`, `libxml`, `session` et le pilote PDO de la base ;
- MySQL ou PostgreSQL ;
- HTTPS obligatoire ;
- accès sortant à CAS et à Bulletins UVSQ.

Procédure :

1. extraire `pulsenotes-global.zip` dans la racine web ;
2. copier `api/config.php.example` vers `api/config.php` ;
3. créer une clé aléatoire d’au moins 32 octets ;
4. renseigner le DSN et le compte de base de données ;
5. protéger `api/config.php` en lecture serveur uniquement ;
6. ouvrir `/api/status`, puis tester une connexion complète.

Exemple :

```php
<?php
return [
    'PULSENOTES_INSTANCE_NAME' => 'PulseNotes',
    'PULSENOTES_APP_KEY' => 'UNE_CLE_ALEATOIRE_LONGUE_ET_UNIQUE',
    'PULSENOTES_DATABASE_DSN' => 'mysql:host=localhost;dbname=pulsenotes;charset=utf8mb4',
    'PULSENOTES_DATABASE_USER' => 'pulsenotes',
    'PULSENOTES_DATABASE_PASSWORD' => 'SECRET_BASE_DE_DONNEES',
];
```

Ne placez jamais ce fichier dans Git. Conservez la clé applicative séparément des sauvegardes de base de données.

## Vérification après installation

- `/api/status` répond en JSON et annonce le bon mode ;
- l’application est servie uniquement en HTTPS ;
- une connexion de test charge les semestres ;
- une déconnexion invalide la session ;
- les fichiers `api/config.php` et `api/data/` ne sont pas téléchargeables ;
- les sauvegardes et la purge des données dormantes sont planifiées.
