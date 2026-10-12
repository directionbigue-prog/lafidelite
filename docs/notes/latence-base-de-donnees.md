# Pourquoi le tableau de bord met huit secondes — mesure, pas hypothèse

J'avais signalé deux fois « ~8 s à l'affichage, ça mérite son propre
examen ». Voici l'examen. La conclusion tient en une phrase : **ce n'est
pas le code, et la plus grande partie disparaîtra en production.**

## Ce qui a été mesuré

Depuis la page elle-même, à chaud, sur le serveur de développement :

| Route | 3 appels successifs |
|---|---|
| `GET /api/couples/me` | 9 031 ms · 10 896 ms · 11 913 ms |
| `GET /api/games/current` | 5 732 ms · 7 217 ms · 9 574 ms |
| `GET /api/auth/me` | 6 716 ms · 6 137 ms · 5 137 ms |

`/api/auth/me` ne touche ni au couple ni à la partie. Qu'il coûte lui aussi
plus de cinq secondes disqualifie d'emblée l'explication « les requêtes du
tableau de bord sont trop lourdes ».

Deux sondes ont écarté les fausses pistes :

- un `GET /api/auth/me` **sans cookie** répond en **20 à 150 ms**. Ce n'est
  donc ni Next.js, ni la compilation en mode dev, ni le middleware : le
  coût n'apparaît qu'au moment où la requête parle à la base.
- `GET /api/readyz` renvoie **503** : sa sonde `SELECT 1` **expire à 1 500 ms**.
  Redis n'est même pas configuré (aucune entrée `redis` dans la réponse),
  donc il n'y est pour rien.

## Le plancher réel

`SELECT 1`, hors Next.js, huit fois de suite sur chaque URL :

| Connexion | Premier | Médiane | Minimum |
|---|---|---|---|
| `DATABASE_URL` (pooler pgbouncer) | 3 802 ms | **1 417 ms** | 1 040 ms |
| `DIRECT_URL` (direct) | 3 088 ms | **329 ms** | 313 ms |

Deux faits en sortent :

1. **Le plancher est d'environ 320 ms par requête**, en direct. C'est la
   distance : la machine de développement et le calcul Neon ne sont pas sur
   le même continent. Aucune optimisation applicative ne descend
   en dessous — une page qui enchaîne trois requêtes ne peut pas passer
   sous la seconde.
2. **Le pooler ajoute environ une seconde par requête** dans ce contexte :
   1 417 ms contre 329 ms, soit un facteur quatre. Le premier appel à
   3–4 s des deux côtés est le réveil du calcul Neon, qui se met en veille
   après inactivité.

## Ce qui a été corrigé

`GET /api/couples/me` faisait **deux allers-retours en série** : la requête
du couple, puis un `gameSession.count` qui avait besoin de `couple.id` et ne
pouvait donc que la suivre. Le décompte voyage désormais dans la même
requête (`_count` filtré sur `status: 'COMPLETED'`). Un aller-retour de
moins sur l'écran le plus visité — gain réel ici comme en production.

## Ce qui n'a pas été touché, et pourquoi

**Le pooler reste le chemin par défaut.** `DATABASE_URL` pointe sur
l'endpoint `-pooler` parce qu'en production Vercel lance de nombreuses
fonctions concurrentes et que Neon s'effondrerait sans lui ; `DIRECT_URL`
existe pour les migrations. Basculer l'application dessus règlerait la
lenteur locale et créerait un problème de production — et ferait diverger
le développement de la production, puisque le mode `pgbouncer=true`
désactive les requêtes préparées.

Si la lenteur locale devient pénible, la bascule vers le direct **en
développement uniquement** est la piste, en connaissance de cette
divergence. C'est une décision d'infrastructure, pas une correction.

## Ce qu'il faut en attendre en production

Sur Vercel, avec la fonction déployée **dans la même région que Neon**, ces
320 ms tombent à quelques millisecondes et le surcoût du pooler devient
marginal. Les huit secondes sont un artefact de l'environnement de
développement, pas une dette du produit.

**Le seul point à vérifier au déploiement** : que la région Vercel et la
région Neon coïncident. Si elles diffèrent, tout ce qui est décrit ici se
reproduira en production — et là ce sera un vrai défaut.
