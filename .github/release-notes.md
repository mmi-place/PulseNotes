# PulseNotes

Cette publication contient les paquets prêts à déployer pour les deux éditions de PulseNotes.

## Archives

- `pulsenotes-global.zip` installe l’édition partagée, prévue pour `https://pulsenotes.mmi.place` ou pour un serveur administré avec MySQL/PostgreSQL.
- `pulsenotes-personal.zip` installe l’édition personnelle, prévue pour un seul utilisateur avec SQLite.
- `install-personal-o2switch.sh` automatise l’installation personnelle sur o2switch depuis le Terminal cPanel.
- Les fichiers `.sha256` permettent de vérifier les téléchargements avant déploiement.

## Installation rapide

- Service global public: `https://pulsenotes.mmi.place`
- Guide d’installation: `documentation/installation.md`
- Guide de mise à jour: `documentation/release.md`

Avant tout déploiement public, configurez HTTPS, une clé `PULSENOTES_APP_KEY` stable et une base de données dédiée.
