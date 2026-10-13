import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Le passage vers la caisse d'un pack.
//
// Ce layout n'existe QUE pour porter le `noindex` (voir `settings/layout.tsx`
// pour le pourquoi) : la page ouvre une commande pour la session en cours, ce
// n'est pas une fiche à proposer dans un moteur. La liste de référence est
// `lib/seo/pages.ts`.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
