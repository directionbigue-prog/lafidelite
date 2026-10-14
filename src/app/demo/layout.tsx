import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// La démo exige un compte depuis la règle de la partie offerte : rien à
// indexer pour un visiteur anonyme, qui est renvoyé vers /connexion. Le
// `noindex` vit dans le layout du segment, comme pour tous les segments
// privés (un `Disallow` seul n'empêche pas l'inscription au catalogue) —
// voir `lib/seo/pages.ts` et `referencement.test.ts`.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
