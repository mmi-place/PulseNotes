# Interface, responsive et accessibilité

## Direction visuelle

PulseNotes utilise un fond papier clair, une grille discrète, des surfaces contrastées et une typographie éditoriale. Les accents colorés signalent un état ou une série de données ; ils ne servent pas de décoration permanente.

Les grands chiffres sont prioritaires. Les ombres et transitions restent sobres afin de préserver la lecture de tableaux denses.

## Responsive

Le desktop reste la référence visuelle. Les adaptations sous `1024`, `780` et `640` px réorganisent l’interface sans retirer de fonctionnalité.

- navigation principale fixée en bas sur mobile ;
- cibles tactiles d’au moins 44 px ;
- indications clavier masquées sur tablette et mobile ;
- champs et période sur la largeur disponible ;
- marges compatibles avec les zones sûres mobiles ;
- absence de débordement horizontal global.

### Tableaux

Le traitement mobile dépend de l’objectif du tableau :

- les notes deviennent un résumé vertical avec détail ouvrable ;
- les tableaux analytiques gardent un défilement horizontal lorsque la comparaison de colonnes est essentielle ;
- les semestres conservent leur structure responsive ;
- aucune transformation automatique de tous les tableaux en cartes.

## Accessibilité

- langue française déclarée sur le document ;
- focus visible sur tous les contrôles ;
- navigation complète au clavier ;
- libellés et états accessibles aux lecteurs d’écran ;
- graphiques accompagnés d’une description ou d’un tableau ;
- couleur jamais utilisée comme seule information ;
- dialogues fermables par `Échap` et clic hors zone, avec restauration du focus ;
- contenu réorganisable sans perte à 320 px et avec zoom texte.

## Mouvement

Les données restent immobiles au repos. Les transitions courtes confirment un survol, un focus ou un changement d’état. Les animations répétées sont réservées aux chargements actifs.

`prefers-reduced-motion: reduce` neutralise les animations non essentielles et rend les transitions immédiates.

## Composants

Les composants partagés vivent dans `src/src/components/`. Ils reçoivent des données normalisées et ne connaissent pas directement les endpoints distants.

Tout composant interactif doit fournir :

- un nom accessible ;
- un état textuel ;
- une utilisation au clavier ;
- un état vide ou d’erreur ;
- un squelette proche de sa géométrie finale lorsque le chargement est visible.

## Matrice de vérification

Tester au minimum :

| Mobile | Tablette | Desktop |
| --- | --- | --- |
| 320, 360, 390 et 430 px | 768 × 1024 | 1440 × 900 |

Contrôler la première et la dernière ligne, les filtres, les modales, la navigation clavier, le zoom texte et l’égalité entre `scrollWidth` et `clientWidth`.
