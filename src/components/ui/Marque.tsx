// La marque de Cœur Fidèle, en SVG inline.
//
// Deux cercles entrelacés, leur intersection en or : deux partenaires et ce
// qu'ils ont en commun. C'est ce que le jeu mesure — le score du couple
// s'affiche avant les scores individuels — donc le signe dit la règle.
//
// INLINE, et pas un `<img src="/logo.svg">`, pour trois raisons : la marque
// apparaît dans l'en-tête de chaque écran, donc une requête de plus par page
// pour 400 octets serait du gaspillage ; un SVG inline hérite de la couleur
// du texte si on le souhaite ; et surtout il s'affiche en même temps que le
// reste, là où une image externe arrive après et fait sauter la mise en page.
//
// Le fichier `public/logo.svg` reste nécessaire pour ce qui sort du rendu
// React — partage, intégrations, et la génération des PNG. `marque.test.ts`
// vérifie que les deux portent la MÊME géométrie : deux copies d'un logo qui
// divergent, c'est deux logos.

export const GEOMETRIE_MARQUE = {
  gaucheCx: 24,
  droiteCx: 40,
  cy: 32,
  r: 13,
  epaisseur: 3.2,
  intersection: 'M32 21.8A13 13 0 0 1 32 42.2A13 13 0 0 1 32 21.8Z',
} as const;

export function Marque({
  taille = 22,
  className,
}: {
  /** Côté du carré, en pixels. 22 est la taille des en-têtes. */
  taille?: number;
  className?: string;
}) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 64 64"
      className={className}
      // La marque est décorative partout où elle apparaît : elle jouxte
      // toujours le mot « Cœur Fidèle », et un lecteur d'écran qui annoncerait
      // les deux dirait le nom deux fois.
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx={GEOMETRIE_MARQUE.gaucheCx}
        cy={GEOMETRIE_MARQUE.cy}
        r={GEOMETRIE_MARQUE.r}
        fill="none"
        stroke="#F6EEE6"
        strokeWidth={GEOMETRIE_MARQUE.epaisseur}
      />
      <circle
        cx={GEOMETRIE_MARQUE.droiteCx}
        cy={GEOMETRIE_MARQUE.cy}
        r={GEOMETRIE_MARQUE.r}
        fill="none"
        stroke="#F6EEE6"
        strokeWidth={GEOMETRIE_MARQUE.epaisseur}
      />
      <path d={GEOMETRIE_MARQUE.intersection} fill="#E8B860" />
    </svg>
  );
}
