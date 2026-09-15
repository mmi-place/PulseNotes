# API PHP

Référence technique du proxy PulseNotes. Consultez d’abord le guide d’[architecture](../documentation/architecture.md) ou d’[installation](../documentation/installation.md) pour une vue d’ensemble.

Le même cœur métier fonctionne dans deux modes strictement séparés : `global` avec une base partagée et `selfhosted` avec une base SQLite pour un seul compte.

## API

- `GET /api/status` : état local de la session ;
- `GET /api/update/status` : version installée, release stable disponible et état de maintenance ;
- `POST /api/update/apply` : installation transactionnelle de la release autorisée ;
- `POST /api/auth` : connexion avec `{ "username": "...", "password": "..." }` ;
- `POST /api/logout` : suppression de la session distante ;
- `POST /api/personal/setup` : configuration initiale du compte personnel ;
- `POST /api/personal/unlock` : ouverture avec le secret local ;
- `POST /api/personal/credential` : remplacement vérifié du mot de passe UVSQ ;
- `POST /api/personal/security` : changement de PIN, schéma ou mot de passe local ;
- `POST /api/request` : requête vers un chemin de `bulletins.iut-velizy.uvsq.fr` ;
- `GET /api/download?semester=...` : téléchargement du bulletin officiel d’un semestre ;
- `DELETE /api/cache/evaluation` : invalidation authentifiée avec `{ "evaluationId": "19713" }` ;
- `POST /api/evaluations/sync` : compare les empreintes complètes et retourne `new`, `modified` ou `seen` ;
- `POST /api/evaluations/seen` : marque une liste d’évaluations comme consultée ;
- `POST /api/evaluations/debug-state` : modifie un état pour le mode d’essai activé avec `?debug` ;
- `GET|POST /api/shares` et `GET|DELETE /api/shares/{token}` : création, consultation et révocation des partages publics.

Exemple de requête générique :

```json
{
  "path": "/services/data.php",
  "method": "GET",
  "query": { "q": "dataPremièreConnexion" }
}
```

Les URL absolues et les hôtes autres que CAS/Bulletins sont refusés afin d’éviter de transformer le serveur en proxy ouvert.

## Cache des rangs

Les réponses `listeNotes` sont conservées 45 secondes dans le dossier temporaire du système. Un verrou distinct par évaluation évite plusieurs téléchargements simultanés de la même distribution. Le cache reste optionnel : s’il est indisponible, le proxy interroge directement Bulletins.

En personnel, `data/pulsenotes.sqlite` conserve les états de lecture, les partages et le mot de passe UVSQ chiffré AES-256-GCM. Le PIN, schéma ou mot de passe local n’est conservé que via `password_hash`. En global, seuls le suivi et les sessions sont chiffrés avant leur stockage dans MySQL/PostgreSQL ; les routes de partage sont désactivées. Les données d’un compte sont purgées après 180 jours sans synchronisation.

## Configuration

Les mises à jour sont activées par défaut. `PULSENOTES_UPDATE_CHECK_TTL` fixe le délai minimal entre deux consultations de GitHub (900 secondes par défaut). En mode personnel, `PULSENOTES_SELFHOST_FORCE_AFTER_DAYS` vaut 15 : la mise à jour reste différable pendant ce délai puis devient obligatoire à la prochaine déconnexion, sans couper une session active.

Les points d’entrée chargent `api/config.php`. Les exemples complets sont disponibles dans `deploy/global/` et `deploy/personal/`.

Variables optionnelles :

- `PULSENOTES_STATS_CACHE_TTL` : durée entre 5 et 300 secondes ;
- `PULSENOTES_CACHE_DIR` : dossier local du cache.
- `PULSENOTES_UPDATE_ENABLED` : active ou désactive la détection automatique ;
- `PULSENOTES_UPDATE_CHECK_TTL` : délai de vérification GitHub, entre 300 et 86 400 secondes ;
- `PULSENOTES_SELFHOST_FORCE_AFTER_DAYS` : délai personnel avant obligation à la déconnexion, entre 1 et 90 jours ;
- `PULSENOTES_UPDATE_TIMEOUT` : durée maximale d’une installation, entre 60 et 900 secondes.

## Tests

Depuis WSL :

```bash
cd /mnt/d/Desktop/PulseNotes/php
php tests/router_test.php
```

Les tests couvrent la séparation des modes, la politique des mises à jour, les accès personnels, la restauration CAS, l’expiration complète, le cache, les documents officiels, le chiffrement des états, le rapprochement d’une note et le cycle des partages publics.
