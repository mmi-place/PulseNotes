# Livraison

## Construire

```bat
build-release.bat
```

Le build compile le frontend puis assemble les points d’entrée PHP propres aux éditions globale et personnelle.

## Vérifications automatisées

```bat
cd src
npm ci
npm run check
npm run security
cd ..
wsl php php/tests/router_test.php
php -l php/router.php
```

Valider également les scripts shell :

```bash
bash -n installer/install-personal-o2switch.sh
bash -n deploy/personal/update.sh
```

## Vérifications navigateur

- connexion et déconnexion ;
- dernier semestre avec et sans note ;
- filtres Notes après rechargement ;
- chargement différé d’une distribution ;
- ouverture et fermeture de toutes les modales ;
- partage, révocation et page de note supprimée ;
- génération puis ouverture d’un PDF ;
- navigation clavier et réduction des mouvements ;
- largeurs 320, 360, 390, 430, 768 et 1440 px ;
- aucune erreur console ni débordement horizontal global.

## Vérifications serveur

- HTTPS et en-têtes de sécurité ;
- mode annoncé par `/api/status` ;
- permissions de `api/config.php` et `api/data/` ;
- connexion réelle avec un compte UVSQ de test ;
- restauration d’une session CAS expirée ;
- sauvegarde puis restauration de la base ;
- limitation de débit et supervision ;
- purge des comptes inactifs.

## Artefacts attendus

```text
output/
├── global/                         Dossier global prêt à téléverser
├── personal/                       Dossier personnel prêt à téléverser
├── install-personal-o2switch.sh    Installateur cPanel
├── pulsenotes-global.zip
├── pulsenotes-global.zip.sha256
├── pulsenotes-personal.zip
└── pulsenotes-personal.zip.sha256
```

Chaque ZIP doit contenir `index.html`, `assets/`, `api/index.php`, `api/router.php`, `api/config.php`, `api/update.sh` et les règles `.htaccess`. Le `config.php` livré contient seulement des valeurs à remplacer, jamais un secret réel. L’édition personnelle contient aussi la protection de `api/data/`.

## Publication

1. attribuer une version au code et aux archives ;
2. conserver les empreintes SHA-256 avec les ZIP ;
3. publier une note de version centrée sur les changements utilisateur et migrations ;
4. déployer d’abord sur une installation de test ;
5. contrôler la santé de l’API avant d’ouvrir la nouvelle version.

Ne publiez aucune archive contenant un `api/config.php` déjà configuré, une base SQLite, des cookies ou des données étudiantes.
