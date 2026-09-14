# Sécurité et confidentialité

## Modèle de confiance

Le navigateur fait confiance à son installation PulseNotes. L’installation accède ensuite à CAS et à Bulletins pour le compte de l’étudiant.

PulseNotes réduit les données persistées, mais une compromission complète du serveur applicatif reste critique. HTTPS, mises à jour, sauvegardes et protection des secrets sont indispensables.

## Édition globale

- le mot de passe UVSQ n’est jamais enregistré ;
- les cookies de session sont chiffrés avec AES-256-GCM ;
- les utilisateurs sont identifiés par une empreinte HMAC ;
- les instantanés et états de notes sont compressés puis chiffrés ;
- les sessions partagées sont stockées dans la base configurée.

Une fuite de la base seule ne doit pas révéler les notes, titres, états de lecture, noms ou cookies. La clé `PULSENOTES_APP_KEY` doit rester hors de la base et de Git.

## Édition personnelle

- SQLite contient les données d’un seul étudiant ;
- le secret local est stocké avec `password_hash` ;
- le mot de passe UVSQ est chiffré avec une clé dérivée du secret local par PBKDF2-SHA-256 ;
- une modification du mot de passe CAS déclenche une demande de remplacement vérifiée.

La déconnexion détruit la session locale sans supprimer la configuration personnelle.

## États des notes

La première synchronisation marque les notes existantes comme vues. Ensuite :

- une évaluation inconnue devient `new` ;
- un instantané différent devient `modified` ;
- un clic, une visibilité prolongée ou l’action globale produit `seen`.

Dans la base globale, ces états restent dans le bloc chiffré de l’évaluation.

## Partages publics

Chaque partage utilise un jeton aléatoire de 32 octets. Le serveur vérifie que l’évaluation correspond à la dernière synchronisation avant de créer l’instantané.

Le lien :

- ne donne accès qu’à une note ;
- ne contient aucun identifiant UVSQ ou cookie ;
- peut être révoqué immédiatement ;
- devient indisponible si la note est supprimée.

Les métadonnées sociales et la carte SVG sont générées depuis ce même instantané limité.

## Rétention

Les états et partages d’un utilisateur global sont supprimés après 180 jours sans synchronisation. Les sessions expirent plus rapidement selon leur propre durée de vie.

Pour 300 utilisateurs, 6 semestres et 80 notes par semestre, les 144 000 enregistrements représentent environ 53 à 103 Mo selon la base et ses index. Une réserve initiale de 150 Mo est raisonnable avant mesure réelle.

## Exploitation minimale

- imposer HTTPS et des cookies sécurisés ;
- limiter le débit des routes d’authentification et de partage ;
- sauvegarder la base sous forme chiffrée ;
- superviser erreurs, espace disque et expirations ;
- séparer les sauvegardes de la clé applicative ;
- tester régulièrement restauration et purge ;
- ne jamais journaliser mots de passe, cookies ou réponses complètes de relevé.
