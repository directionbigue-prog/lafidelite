// Le manifeste d'application : ce que voit un téléphone qui ajoute le site à
// son écran d'accueil.
//
// Utile ici parce que le produit se joue à deux sur UN téléphone — c'est le
// modèle « pass-and-play » — donc l'installer sur l'écran d'accueil est le
// geste naturel, et sans manifeste le navigateur l'ouvre dans un onglet avec
// sa barre d'adresse, qui mange un cinquième de l'écran pendant la partie.
import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Cœur Fidèle',
    short_name: 'Cœur Fidèle',
    description:
      'Un jeu de couple à deux, côte à côte ou à distance en vidéo. Trois manches, et un score commun.',
    lang: 'fr',
    start_url: '/jeu',
    display: 'standalone',
    orientation: 'portrait',
    // Les deux couleurs de la charte : l'encre du fond, et l'or de l'accent.
    background_color: '#170D1B',
    theme_color: '#170D1B',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // `maskable` autorise Android à recadrer dans sa propre forme. La marque
      // tient dans le cercle inscrit, donc le recadrage ne la coupe pas.
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
