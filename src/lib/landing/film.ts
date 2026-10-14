// Le film publicitaire de la landing : quand il joue, et quand il se tait.
//
// La vidéo pèse 7 Mo pour 20 secondes. Sur l'accueil, la plupart des
// visiteurs arrivent en données mobiles, que l'on paie au mégaoctet : un film
// lancé dès l'ouverture de la page facture 7 Mo à quelqu'un qui n'a peut-être
// jamais fait défiler jusqu'à lui. La décision est donc prise ici, en pur, et
// le composant `components/landing/FilmPub.tsx` ne fait que l'appliquer — il
// n'y a pas de jsdom dans ce dépôt, et ce qui vit dans le composant ne se
// teste pas.
//
// Deux règles ne se discutent pas et sont tenues par `doitJouer` :
//   · hors de l'écran, le film est en pause (ni batterie ni données pour
//     une vidéo que personne ne regarde) ;
//   · un choix du visiteur l'emporte sur tout réglage automatique. Une pause
//     demandée reste une pause — WCAG 2.2.2 exige de pouvoir arrêter un
//     contenu animé de plus de 5 secondes —, et une lecture demandée joue
//     même en mode économie de données, puisque c'est lui qui l'a voulue.

/** Ce que le visiteur a demandé avec le bouton du lecteur. */
export type ChoixVisiteur = 'aucun' | 'lecture' | 'pause';

/** Ce que l'appareil dit de lui-même, lu une fois monté. */
export type ConditionsAppareil = {
  /** `prefers-reduced-motion: reduce` */
  mouvementReduit: boolean;
  /** `navigator.connection.saveData` — mode économie de données du navigateur. */
  economieDonnees: boolean;
  /**
   * `navigator.connection.effectiveType` : 'slow-2g' | '2g' | '3g' | '4g'.
   * `undefined` sur Safari et Firefox, qui n'exposent pas cette API.
   */
  reseau: string | undefined;
};

/**
 * Le film démarre-t-il tout seul, sans que le visiteur ait rien demandé ?
 *
 * Appelée seulement quand le lecteur est visible et que le visiteur n'a pas
 * encore touché au bouton.
 *
 * Un réseau LENT refuse : en '3g' au sens de Chrome (débit sous 700 kb/s),
 * les 7 Mo mettent plus d'une minute à arriver pour un film encodé à
 * 2,8 Mb/s — il saccaderait, et le visiteur aurait payé pour le voir mal.
 * Un réseau INCONNU joue : Safari et Firefox n'exposent pas
 * `effectiveType`, et exiger '4g' priverait tous les iPhone du film. Le
 * visiteur garde le bouton pause, et le mode économie de données reste la
 * façon explicite de dire non.
 */
export function lectureAutomatique({
  mouvementReduit,
  economieDonnees,
  reseau,
}: ConditionsAppareil): boolean {
  if (mouvementReduit || economieDonnees) return false;
  return reseau === undefined || reseau === '4g';
}

export function doitJouer({
  visible,
  choix,
  ...conditions
}: ConditionsAppareil & { visible: boolean; choix: ChoixVisiteur }): boolean {
  if (!visible || choix === 'pause') return false;
  if (choix === 'lecture') return true;
  return lectureAutomatique(conditions);
}
