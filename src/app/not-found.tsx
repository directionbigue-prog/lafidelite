// La page 404 — en français et dans la charte.
//
// Sans ce fichier, Next servait sa page par défaut : « 404: This page could
// not be found. », en anglais, fond blanc, sans aucun lien. Le cas le plus
// courant ici est un ancien lien d'invitation ou de partie : on renvoie vers
// l'accueil du jeu et vers la page d'entrée.
import type { Metadata } from 'next';
import { FocusLayout } from '@/components/ui/FocusLayout';
import { ButtonLink } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Page introuvable',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <FocusLayout centerText>
      <p className="text-[11px] uppercase tracking-[0.16em] text-cream/50">Erreur 404</p>
      <h1 className="font-serif text-[clamp(28px,5vw,36px)] leading-tight">
        Cette page n’existe pas
      </h1>
      <p className="text-cream/70">
        Le lien est peut-être ancien, ou l’adresse a été mal recopiée.
      </p>
      <div className="flex flex-col gap-3">
        <ButtonLink href="/jeu">Aller au jeu</ButtonLink>
        <ButtonLink href="/" variant="ghost">
          Page d’accueil
        </ButtonLink>
      </div>
    </FocusLayout>
  );
}
