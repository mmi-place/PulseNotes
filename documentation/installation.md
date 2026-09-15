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

- `output/pulsenotes-global.zip` ;
- `output/pulsenotes-personal.zip` ;
- un fichier `.sha256` pour chaque archive ;
- `output/install-personal-o2switch.sh`.

## Installation personnelle sur o2switch

![Flux de l'installation personnelle](assets/installation-personnelle.svg)

L’installateur cible le Terminal cPanel. Il récupère la dernière archive de la GitHub Release, vérifie son empreinte SHA-256, crée le sous-domaine `pulsenotes`, installe les fichiers, génère la clé applicative et protège SQLite. S’il existe déjà une installation, `api/config.php` et `api/data/` sont conservés.

Avant l’installation, activez l’extension PHP **imagick** dans cPanel (Select PHP Version > Extensions). Elle est nécessaire pour convertir les cartes de partage en PNG 1200 × 630. Vérifiez ensuite dans le Terminal :

```bash
php -m | grep -i '^imagick$'
```

La commande doit afficher `imagick`. L’extension doit aussi être activée pour la version PHP utilisée par le domaine, pas uniquement pour le PHP CLI.

Depuis le Terminal cPanel, vous pouvez le télécharger depuis le service global :

```bash
curl -fsSL https://pulsenotes.mmi.place/install.sh | bash
```

Cette route courte relaie l’installateur publié dans la dernière GitHub Release. Vérifiez le script avant exécution si votre politique d’exploitation l’exige.

L’URL de téléchargement par défaut peut être remplacée :

```bash
PULSENOTES_RELEASE_URL="https://example.org/pulsenotes-personal.zip" \
PULSENOTES_RELEASE_HASH_URL="https://example.org/pulsenotes-personal.zip.sha256" \
  bash install-personal-o2switch.sh
```

À la fin, le script affiche un encadré jaune avec l’adresse du site. Si AutoSSL n’a pas encore activé HTTPS, attendez sa propagation puis ouvrez cette adresse. L’assistant vérifie le compte UVSQ, puis permet de choisir un PIN, un schéma ou un mot de passe local.

### Mise à jour personnelle

PulseNotes vérifie naturellement les releases stables lors de son utilisation, au maximum une fois toutes les quinze minutes. Après la connexion locale, une popup propose la nouvelle version. Elle peut être reportée pendant quinze jours à compter de sa publication. Une fois ce délai passé, la session en cours n’est pas interrompue, mais la mise à jour devient obligatoire dès la déconnexion ou l’expiration de la session.

L’installation est réalisée en PHP avec cURL et ZipArchive. Elle préserve `api/config.php`, `api/data/` et la base SQLite. Aucun cron n’est nécessaire. Le script `api/update.sh` reste disponible comme solution de secours administrateur.

Avant une mise à jour :

1. sauvegarder le dossier de l’installation ;
2. vérifier l’URL et l’empreinte de la nouvelle archive ;
3. utiliser la popup ou, en secours, exécuter l’updater depuis le compte d’hébergement ;
4. contrôler `/api/status` et ouvrir l’application.

## Installation globale

Le service global public prévu pour PulseNotes est : <https://pulsenotes.mmi.place>.

Prérequis serveur :

- PHP 8.1 ou supérieur avec `curl`, `zip`, `dom`, `libxml`, `session` et le pilote PDO de la base ;
- PHP 8.1 ou supérieur avec `imagick` pour les images PNG de partage ;
- MySQL ou PostgreSQL ;
- HTTPS obligatoire ;
- accès sortant à CAS et à Bulletins UVSQ.

Procédure :

1. extraire `pulsenotes-global.zip` dans la racine web ;
2. ouvrir le fichier `api/config.php` déjà présent ;
3. remplacer toutes les valeurs `CHANGEZ_…` et créer une clé aléatoire d’au moins 32 octets ;
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

### Clé applicative

`PULSENOTES_APP_KEY` est la clé maîtresse de l’installation. Elle protège les sessions, les instantanés de notes et, en installation personnelle, les partages enregistrés. Générez-la une seule fois :

```bash
openssl rand -hex 32
```

Elle doit rester secrète, stable et différente entre deux installations. La perdre rend les données chiffrées illisibles ; la modifier sans migration invalide les sessions et les enregistrements existants.

### Mise à jour globale

Le premier accès qui détecte une nouvelle release stable déclenche automatiquement la mise à jour. Pendant l’opération, toutes les interfaces affichent un écran de maintenance demandant de patienter quelques minutes. La configuration et la base distante sont conservées. En cas d’échec, l’ancienne version est restaurée et une temporisation empêche les tentatives en boucle.

Ce mécanisme est déclenché par le trafic normal et ne nécessite aucune tâche cron. `api/update.sh` reste disponible comme solution de secours :

```bash
cd /chemin/du/site/api
./update.sh
```

Le domaine n’est pas configuré dans l’updater : le dossier cible est déterminé par l’emplacement du script. Exécuter `/home/compte/pulsenotes/api/update.sh` met donc à jour l’application servie par le domaine dont la racine pointe vers `/home/compte/pulsenotes`.

Pour utiliser un serveur de versions différent :

```bash
PULSENOTES_RELEASE_URL="https://releases.example.org/pulsenotes-global.zip" ./update.sh
```

L’empreinte SHA-256 publiée et le digest de l’asset GitHub sont vérifiés avant l’installation. L’updater refuse les rétrogradations, les redirections non autorisées, les chemins ZIP dangereux et les exécutions simultanées.

## Vérification après installation

- `/api/status` répond en JSON et annonce le bon mode ;
- l’application est servie uniquement en HTTPS ;
- une connexion de test charge les semestres ;
- une déconnexion invalide la session ;
- les fichiers `api/config.php` et `api/data/` ne sont pas téléchargeables ;
- les sauvegardes et la purge des données dormantes sont planifiées.
