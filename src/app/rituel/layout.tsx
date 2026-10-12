import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Derrière la session.
//
// Ce layout n'existe QUE pour porter le `noindex` (voir `settings/layout.tsx`
// pour le pourquoi d'un layout plutôt qu'un `metadata` de page, et d'un
// `noindex` en plus du `Disallow`). La liste de référence est
// `lib/seo/pages.ts`.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
