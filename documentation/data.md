# Données et calculs

## Sources

PulseNotes s’appuie principalement sur les routes Bulletins suivantes :

| Donnée | Route distante |
| --- | --- |
| Session et configuration | `data.php?q=dataPremièreConnexion` |
| Liste des semestres | `data.php?q=semestresEtudiant` |
| Relevé d’un semestre | `data.php?q=relevéEtudiant&semestre=…` |
| Distribution d’une évaluation | `data.php?q=listeNotes&eval=…` |
| Documents officiels | `bulletin_PDF.php` |

Ces routes sont appelées exclusivement par le proxy.

## Valeurs de référence

Les moyennes de semestre, module et UE affichent en priorité les valeurs du relevé. PulseNotes ne tente pas de reproduire les règles de compensation ou de jury.

| Indicateur | Méthode |
| --- | --- |
| Moyenne du semestre | Valeur du relevé |
| Moyenne de promotion | Valeur du relevé |
| Rang du semestre | Valeur du relevé |
| Moyenne d’UE | Valeur du relevé |
| Moyenne de module | Valeur du relevé, ou évaluations publiées si un faux zéro est détecté |
| Rang d’évaluation | Nombre de notes strictement supérieures, plus un |
| Agrégat multi-semestres | Moyenne des semestres disponibles |

Un agrégat calculé par PulseNotes reste indicatif et ne remplace jamais une décision officielle.

## Valeurs absentes

Les chaînes vides, `~`, valeurs non numériques et nombres non finis deviennent `null`. Une valeur absente :

- n’est jamais affichée comme zéro ;
- n’entre pas dans une moyenne ;
- ne crée pas de point de graphique ;
- produit un état explicite lorsque l’information est nécessaire.

## UE et périodes

Le code logique d’une UE est indépendant du semestre : `MM1UE1` et `MM2UE1` correspondent à l’UE1 de périodes différentes. Les comparaisons regroupent donc le numéro d’UE tout en conservant chaque semestre comme série distincte.

Une année tient compte du niveau de cursus, de l’année scolaire et de la formation afin de ne pas fusionner une réorientation ou un redoublement.

## Reconnaissance d’une évaluation

Le serveur tente successivement :

1. l’identifiant ScoDoc exact ;
2. une identité HMAC du semestre, du titre, du module, du type et des UE ;
3. un score de ressemblance si l’identifiant ou le libellé a changé.

La date, la note et le coefficient ne définissent pas l’identité. Leur modification transforme l’état existant en `modified`.

Le rapprochement approché exige un score minimal de `0,78` et un écart de `0,08` avec le second candidat. En cas d’ambiguïté, une nouvelle référence est créée plutôt que de fusionner deux évaluations.
