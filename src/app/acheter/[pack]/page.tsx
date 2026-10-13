'use client';

// /acheter/[pack] — un clic sur un pack, et le paiement PayTech s'ouvre.
//
// C'est la destination de TOUTES les cartes de pack quand le visiteur n'a
// pas encore de session (accueil, /tarifs, /jeu/nouvelle), et celle vers
// laquelle /connexion et /inscription reviennent une fois la session ouverte.
//
//   - Connecté : la commande part tout de suite (`BoutonAcheterPack
//     automatique`) et le navigateur est remplacé par la page PayTech. Un
//     bouton reste affiché si le lancement échoue.
//   - Sans session : on garde le choix (`?next=` + mémoire locale, voir
//     lib/game/pack-choisi.ts) et on propose de créer un compte ou de se
//     connecter. Le paiement s'ouvre au retour, sans recliquer.
//   - Pack inconnu ou retiré de la vente : on le dit, et on renvoie aux tarifs.
//     Le serveur refuserait de toute façon (`PACK_NOT_FOR_SALE`) ; l'écran
//     évite seulement d'offrir un bouton qui échouerait.
import { use, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { FocusLayout } from '@/components/ui/FocusLayout';
import { Alert } from '@/components/ui/Alert';
import { ButtonLink } from '@/components/ui/Button';
import { BoutonAcheterPack } from '@/components/game/BoutonAcheterPack';
import { estAchetable, LIBELLE_DEVISE, packParId } from '@/lib/game/packs';
import { cheminAchat, memoriserPackChoisi } from '@/lib/game/pack-choisi';
import { formatPrice } from '@/lib/utils';

export default function AcheterPage({ params }: { params: Promise<{ pack: string }> }) {
  const { pack: brut } = use(params);
  const pack = packParId(decodeURIComponent(brut).toUpperCase());
  const achetable = estAchetable(pack);
  const { user, loading } = useAuth();

  // Sans session, le choix est gardé pour le seul chemin qui perd le `next` :
  // le lien du mail de vérification, ouvert dans un autre onglet.
  useEffect(() => {
    if (!loading && !user && pack && achetable) memoriserPackChoisi(pack.id);
  }, [loading, user, pack, achetable]);

  if (!pack || !achetable) {
    return (
      <FocusLayout centerText>
        <h1 className="font-serif text-[clamp(28px,5vw,36px)] leading-tight">
          Ce pack n’est pas proposé
        </h1>
        <Alert tone="error">Ce pack n’est pas ou plus en vente.</Alert>
        <ButtonLink href="/tarifs">Voir les packs</ButtonLink>
      </FocusLayout>
    );
  }

  if (loading) return null;

  const prix = `${formatPrice(pack.prix)} ${LIBELLE_DEVISE}`;
  const retour = encodeURIComponent(cheminAchat(pack.id));

  return (
    <FocusLayout centerText>
      <p className="text-[11px] uppercase tracking-[0.16em] text-cream/50">Pack {pack.nom}</p>
      <h1 className="font-serif text-[clamp(28px,5vw,36px)] leading-tight">
        {prix} <span className="text-cream/60">{pack.periode}</span>
      </h1>
      <p className="text-cream/70">{pack.resume}</p>

      {user ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-cream/60">
            Ouverture du paiement sécurisé PayTech : Wave, Orange Money, Free Money ou carte
            bancaire.
          </p>
          <BoutonAcheterPack packId={pack.id} libelle={`Payer ${prix}`} automatique />
          <ButtonLink href="/tarifs" variant="ghost">
            Choisir un autre pack
          </ButtonLink>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-cream/60">
            Créez votre compte ou connectez-vous : le paiement PayTech s’ouvrira juste après.
          </p>
          <ButtonLink href={`/inscription?next=${retour}`}>Créer mon compte</ButtonLink>
          <ButtonLink href={`/connexion?next=${retour}`} variant="secondary">
            J’ai déjà un compte
          </ButtonLink>
        </div>
      )}
    </FocusLayout>
  );
}
