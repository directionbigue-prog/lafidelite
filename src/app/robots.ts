// robots.txt, dérivé du même registre que le sitemap.
//
// Un `Disallow` dit « ne va pas voir » ; il ne dit PAS « n'inscris pas au
// catalogue ». Une URL découverte ailleurs — un lien partagé, un message —
// peut être indexée sans jamais être visitée. C'est pourquoi chaque segment
// privé porte AUSSI un `noindex` dans son `layout.tsx` : les deux ensemble
// couvrent les deux chemins, et aucun ne suffit seul.
import type { MetadataRoute } from 'next';
import { ORIGINE_CANONIQUE, PREFIXES_INTERDITS, urlAbsolue } from '@/lib/seo/pages';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [...PREFIXES_INTERDITS],
      },
    ],
    sitemap: urlAbsolue('/sitemap.xml'),
    host: ORIGINE_CANONIQUE,
  };
}
