// Les données structurées (JSON-LD) de l'accueil : ce que Google lit pour
// comprendre QUI publie le site, CE QU'il vend et À QUEL PRIX.
//
// Tout est dérivé : les offres du registre des packs, la FAQ de la variable
// même que la page affiche, l'origine du registre des pages. Une donnée
// structurée recopiée à la main dérive comme le reste — et une donnée qui
// décrit autre chose que ce que la page MONTRE est, pour Google, un balisage
// trompeur passible d'action manuelle.
//
// Ni note ni avis : le produit n'a pas d'avis publiés, et une
// `aggregateRating` inventée est précisément la fraude que ces actions
// manuelles visent.

import { PACKS_PAYANTS, packDecouverte } from '@/lib/game/packs';
import type { FaqItem } from '@/lib/landing/design-data';
import { NOM_DU_SITE, pageDuChemin, urlAbsolue } from './pages';

type Noeud = Record<string, unknown> & { '@type': string };

export function donneesStructureesAccueil(faq: readonly FaqItem[]): {
  '@context': 'https://schema.org';
  '@graph': Noeud[];
} {
  const accueil = urlAbsolue('/');
  const organisation = `${accueil}#organisation`;
  const description = pageDuChemin('/')?.description ?? '';

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organisation,
        name: NOM_DU_SITE,
        url: accueil,
        logo: urlAbsolue('/icon-512.png'),
      },
      {
        '@type': 'WebSite',
        '@id': `${accueil}#site`,
        name: NOM_DU_SITE,
        url: accueil,
        inLanguage: 'fr',
        publisher: { '@id': organisation },
      },
      {
        '@type': 'WebApplication',
        '@id': `${accueil}#application`,
        name: NOM_DU_SITE,
        url: accueil,
        description,
        applicationCategory: 'GameApplication',
        operatingSystem: 'Web',
        inLanguage: 'fr',
        publisher: { '@id': organisation },
        offers: [packDecouverte(), ...PACKS_PAYANTS].map((pack) => ({
          '@type': 'Offer',
          name: pack.nom,
          // schema.org attend le prix en texte, dans l'unité affichée : le
          // franc CFA n'a pas de décimales, donc `prix` est déjà ce nombre.
          price: String(pack.prix),
          priceCurrency: pack.devise,
          url: urlAbsolue('/tarifs'),
        })),
      },
      {
        '@type': 'FAQPage',
        '@id': `${accueil}#faq`,
        mainEntity: faq.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ],
  };
}

/**
 * Le texte d'une balise `<script type="application/ld+json">`.
 *
 * `JSON.stringify` n'échappe pas `<` : une réponse de FAQ contenant
 * `</script>` refermerait la balise et injecterait la suite dans la page.
 * `<` est le même caractère pour un lecteur JSON, et rien pour HTML.
 */
export function scriptJsonLd(donnees: unknown): string {
  return JSON.stringify(donnees).replace(/</g, '\\u003c');
}
