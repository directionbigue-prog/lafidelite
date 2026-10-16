// /tarifs — les trois packs, et ce que chacun ouvre.
//
// Composant serveur : rien ici n'a d'état. Les prix, les durées et les
// listes de thèmes viennent tous de `lib/game/packs.ts`, jamais d'un
// littéral écrit sur cette page — c'est le même registre que le serveur
// consulte pour refuser un thème, donc cette page ne peut pas annoncer un
// palier que le moteur n'appliquerait pas.
//
// L'achat (depuis le 13/10/2026) : un `BoutonAcheterPack` par pack payant.
// Il n'envoie que l'identifiant ; le prix est relu du registre côté serveur,
// et le webhook Bictorys ouvre le droit quand le paiement est confirmé.
import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';
import { BoutonAcheterPack } from '@/components/game/BoutonAcheterPack';
import { LIBELLE_DEVISE, PACKS_VISIBLES, PACKS_PAYANTS, packDecouverte } from '@/lib/game/packs';
import { metadataDePage } from '@/lib/seo/pages';

// Titre, description, canonique et carte de partage viennent du registre des
// pages (`lib/seo/pages.ts`), dont la description lit elle-même les noms des
// paliers dans `lib/game/packs.ts`. Écrites ici à la main jusqu'au
// 16/10/2026, elles ne posaient pas de canonique : la page héritait de celle
// du layout racine, « / », et Google la tenait pour un doublon de l'accueil.
// La version transcrite d'avant avait déjà annoncé des paliers supprimés.
export const metadata: Metadata = metadataDePage('/tarifs');

/**
 * 4900 → « 4 900 », avec une espace fine insécable (U+202F).
 *
 * Groupé à la main plutôt que par `toLocaleString('fr-FR')` : le séparateur
 * que renvoie ICU varie selon la version de Node et la plateforme — espace
 * insécable, espace fine, parfois espace ordinaire — et un prix qui se coupe
 * en fin de ligne entre le 4 et le 900 se lit comme deux nombres.
 */
function prixLisible(montant: number): string {
  return String(montant).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
}

export default function TarifsPage() {
  const decouverte = packDecouverte();

  return (
    <AppShell active="accueil" acces="public">
      <div className="flex max-w-4xl flex-col gap-8">
        <header>
          <p className="text-[11px] uppercase tracking-[0.16em] text-cream/50">Nos packs</p>
          <h1 className="mt-2 font-serif text-[clamp(30px,4.5vw,44px)] leading-[1.05]">
            Ce que chaque pack ouvre
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-cream/65">
            Un pack ouvre les thèmes pour <strong className="text-cream/85">les deux</strong> : il
            suffit que l’un de vous en détienne un.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {/* PACKS_VISIBLES, pas PACKS : l’Annuel est retiré de la vente depuis le
              02/10/2026 mais reste dans le registre pour que les droits déjà payés
              restent résolubles. Itérer sur PACKS le remettrait en vitrine. */}
          {PACKS_VISIBLES.map((pack) => {
            const gratuit = pack.prix === 0;
            return (
              <section
                key={pack.id}
                className={`flex flex-col gap-4 rounded-2xl border p-6 ${
                  pack.id === 'INTEGRAL'
                    ? 'border-gold bg-plum-card'
                    : 'border-cream/14 bg-plum-card/50'
                }`}
              >
                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="font-serif text-2xl">{pack.nom}</h2>
                    {pack.id === 'INTEGRAL' && (
                      <span className="shrink-0 rounded-full border border-rose/34 px-2.5 py-0.5 text-[11px] font-semibold text-rose max-md:text-[12px]">
                        Recommandé
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-serif text-3xl text-gold">
                    {/* LIBELLE_DEVISE, pas `pack.devise` : ce champ porte le code
                        ISO 4217 attendu par le prestataire de paiement, et cet
                        écran affichait donc « 4 900 XOF » quand l'accueil
                        affichait « 4 900 FCFA » pour la même somme. */}
                    {gratuit ? 'Gratuit' : `${prixLisible(pack.prix)} ${LIBELLE_DEVISE}`}
                    {pack.periode && (
                      <span className="ml-2 font-grotesk text-sm text-cream/55">
                        {pack.periode}
                      </span>
                    )}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-cream/65">{pack.resume}</p>
                </div>

                <ul className="flex flex-col gap-1.5 text-sm text-cream/70">
                  <li>
                    <span className="text-gold">·</span> {pack.themes.length}{' '}
                    {pack.themes.length > 1 ? 'thèmes' : 'thème'}
                  </li>
                  <li>
                    <span className="text-gold">·</span>{' '}
                    {pack.salon ? 'Le Salon inclus, les cinq jeux' : 'Salon non inclus'}
                  </li>
                  <li>
                    <span className="text-gold">·</span>{' '}
                    {gratuit ? 'Une partie offerte, pour essayer' : 'Parties illimitées'}
                  </li>
                </ul>

                <ul className="mt-auto flex flex-col gap-1 border-t border-cream/10 pt-3 text-[13px] text-cream/50">
                  {pack.themes.map((nom) => (
                    <li key={nom}>{nom}</li>
                  ))}
                </ul>

                {!gratuit && <BoutonAcheterPack packId={pack.id} libelle={`Choisir ${pack.nom}`} />}
              </section>
            );
          })}
        </div>

        <section className="rounded-2xl border border-cream/12 bg-plum-card2 p-5">
          <p className="text-[10px] uppercase tracking-[0.14em] text-cream/50">Le paiement</p>
          <p className="mt-2 text-sm leading-relaxed text-cream/65">
            Le paiement se fait sur la page sécurisée de notre prestataire, Bictorys. Le pack
            s’ouvre dès que le paiement est confirmé, pour vous deux. Les {PACKS_PAYANTS.length}{' '}
            packs ci-dessus sont sans engagement : {decouverte.nom} reste gratuit, à un seul thème.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
