import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Formulaire utilitaire.
//
// Ce layout n'existe QUE pour porter le `noindex`. Il ne met rien en page :
// les ecrans de ce segment ont deja leur coquille (AppShell, FocusLayout,
// AuthSplitLayout), et en ajouter une seconde casserait la mise en page.
//
// Pourquoi un layout et pas un `export const metadata` dans la page : ces
// ecrans sont des composants client, et un composant client ne peut pas en
// exporter. Pourquoi en plus du `Disallow` de robots.txt : un `Disallow`
// empeche la VISITE, pas l'inscription au catalogue — une URL partagee
// ailleurs peut etre indexee sans jamais avoir ete visitee.
//
// La liste de reference est `lib/seo/pages.ts` ; `referencement.test.ts`
// verifie que chaque segment non indexable a bien son layout.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
