// Le sitemap, dérivé du registre — jamais écrit à la main.
//
// Next sert ce module à `/sitemap.xml`. N'y entrent que les pages déclarées
// indexables et non dynamiques : une URL derrière la session n'apporte rien à
// un moteur, et une URL paramétrée publierait ce qu'elle protège.
import type { MetadataRoute } from 'next';
import { PAGES_INDEXABLES, urlAbsolue } from '@/lib/seo/pages';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  // Une date de build plutôt qu'une date par page : le produit n'a pas de
  // contenu daté, et inventer un `lastModified` par page serait un signal
  // faux — les moteurs le traitent comme une information, pas comme un ornement.
  const maintenant = new Date();

  return PAGES_INDEXABLES.map((page) => ({
    url: urlAbsolue(page.chemin),
    lastModified: maintenant,
    changeFrequency: page.frequence ?? 'monthly',
    priority: page.priorite ?? 0.5,
  }));
}
