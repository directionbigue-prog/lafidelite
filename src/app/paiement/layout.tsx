import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Derrière la session : le retour de paiement d'une commande.
//
// Ce layout n'existe QUE pour porter le `noindex` (voir `settings/layout.tsx`
// pour le pourquoi). La liste de référence est `lib/seo/pages.ts`.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
