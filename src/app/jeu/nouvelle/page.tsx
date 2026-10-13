'use client';

// /jeu/nouvelle — "Vous avez combien de temps ?" (planche 04 mobile,
// planche 02 web).
//
// Game creation moved here from /jeu's button. The dashboard now navigates;
// this screen is what actually POSTs, because the format has to be chosen
// before the questions are drawn — the draw is what makes a game 5, 15 or
// 30 questions long, and it happens once, inside the creating transaction.
//
// What the canvas shows that is NOT here, and why:
//   - the points price under each format (20 / 50 / 90 pts). There is no
//     points economy in this build, and a price nothing charges is a
//     promise the product cannot keep. The FIRST half of that economy does
//     exist though: one free game per couple, spent on creation. When it
//     is gone this screen stops being a picker and says so — see the
//     `spent` branch below.
// Le sélecteur de thèmes, lui, EST là depuis que la banque le porte. Il
// attendait le contenu, pas le code : le moteur acceptait `categories`
// depuis le lot 2, mais six des huit thèmes annoncés n'avaient aucune
// question, et `narrowToCategories` élargissait au pool complet sans rien
// dire — une carte qui promet « Ex et passé » suivie d'une partie qui
// parle d'autre chose. Chaque thème porte maintenant dix questions par
// manche, soit le tirage maximal (Longue soirée : 10/10/10), et
// `lib/game/themes.test.ts` fait échouer CI si l'un d'eux repasse sous ce
// seuil.
//
// The "deux jokers chacun" note IS here: jokers are real, two per player,
// enforced by the skip route.
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { toGameApiSuccess, toGameApiFailure } from '@/lib/game/api-result';
import { interpretCreateGame } from '@/lib/game/start-screen';
import { GAME_FORMATS, DEFAULT_FORMAT_ID, type GameFormatId } from '@/lib/game/formats';
import { THEMES, basculerTheme, corpsDeCreation } from '@/lib/game/themes';
import { palierDuTheme, THEME_DECOUVERTE, PACKS_PAYANTS, LIBELLE_DEVISE } from '@/lib/game/packs';
import { AppShell } from '@/components/app/AppShell';
import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';
import { BoutonAcheterPack } from '@/components/game/BoutonAcheterPack';

interface GameSessionResponse {
  id: string;
  phase: string;
}

export default function NouvellePartiePage() {
  const user = useUser('/connexion');
  const router = useRouter();
  const [choice, setChoice] = useState<GameFormatId>(DEFAULT_FORMAT_ID);
  // Aucun thème coché au départ : la partie se joue alors sur toute la
  // banque, fonds général compris. C'est un choix par défaut, pas un
  // état incomplet — rien n'oblige un couple à choisir un sujet.
  const [themes, setThemes] = useState<string[]>([]);
  // Les thèmes que le palier du couple ouvre. `null` tant que la réponse
  // n'est pas là : on n'affiche alors AUCUN cadenas plutôt que de les
  // afficher tous. Supposer le pire pendant le chargement ferait clignoter
  // huit cartes verrouillées sur l'écran d'un abonné qui a tout payé.
  const [ouverts, setOuverts] = useState<string[] | null>(null);

  useEffect(() => {
    let vivant = true;
    api<{ themes: string[] }>('/api/packs/me')
      .then((r) => {
        if (vivant) setOuverts(r.themes);
      })
      // Un échec de lecture ne bloque rien : le serveur revérifie de toute
      // façon à la création, et un joueur qui tente un thème fermé reçoit
      // un message clair plutôt qu'un écran vide.
      .catch(() => {
        if (vivant) setOuverts(null);
      });
    return () => {
      vivant = false;
    };
  }, []);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Not an error: a state. See `interpretCreateGame`'s 'free-game-used'.
  const [spent, setSpent] = useState(false);

  if (!user) return null;

  async function launch() {
    setCreating(true);
    setError(null);
    const result = await api<GameSessionResponse>('/api/games', {
      method: 'POST',
      body: corpsDeCreation(choice, themes),
    })
      .then(toGameApiSuccess)
      .catch(toGameApiFailure);

    const outcome = interpretCreateGame(result);
    if (outcome.kind === 'started') {
      router.push(outcome.path);
      return;
    }
    // The disclaimer gate lives on /jeu, which is also where this screen is
    // reached from — so a couple who somehow arrives here ungated is sent
    // back to the one screen that can resolve it, never left stuck.
    if (outcome.kind === 'disclaimer-gate') {
      router.replace('/jeu');
      return;
    }
    if (outcome.kind === 'free-game-used') {
      setSpent(true);
      setCreating(false);
      return;
    }
    setError(outcome.message);
    setCreating(false);
  }

  if (spent) {
    return (
      <AppShell active="accueil">
        {/*
          The format picker is gone rather than disabled. Leaving three
          choices on screen next to a refusal invites the player to try
          another one, and every one of them is refused identically — the
          limit is on the account, not on the length of the game.

          This is the shell of the canvas's recharge screen (planche 11)
          with nothing in it yet, and it says so plainly. Inventing a
          payment button that charges nothing would be worse than an
          honest wait: the whole reason this rule exists is that games
          will be paid for.
        */}
        <div className="flex max-w-xl flex-col gap-6">
          <header>
            <p className="text-[11px] uppercase tracking-[0.16em] text-cream/50">Nouvelle partie</p>
            <h1 className="mt-2 font-serif text-[clamp(30px,4.5vw,44px)] leading-[1.05]">
              Votre partie offerte est déjà jouée
            </h1>
          </header>

          <p className="text-[15px] leading-relaxed text-cream/70">
            Votre couple a droit à une partie offerte, et elle a été jouée. Pour continuer, il
            suffit que l’un de vous prenne un pack : il ouvre les parties pour vous deux, pendant
            toute sa durée.
          </p>

          {/* Dérivé du registre comme /tarifs : nom, prix, durée. Choisir selon
              le temps qu'on a devant soi — les paliers diffèrent par la durée. */}
          <ul className="flex flex-col gap-3">
            {PACKS_PAYANTS.map((pack) => (
              <li
                key={pack.id}
                className="flex flex-col gap-3 rounded-2xl border border-cream/12 bg-plum-card2 p-4"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <p className="font-serif text-lg">{pack.nom}</p>
                    <p className="text-sm text-cream/60">{pack.resume}</p>
                  </div>
                  <p className="shrink-0 font-serif text-xl text-gold">
                    {String(pack.prix).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} {LIBELLE_DEVISE}
                    {pack.periode && (
                      <span className="ml-1.5 font-grotesk text-xs text-cream/55">
                        {pack.periode}
                      </span>
                    )}
                  </p>
                </div>
                <BoutonAcheterPack packId={pack.id} libelle={`Choisir ${pack.nom}`} />
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <ButtonLink href="/tarifs" variant="ghost">
              Comparer les packs
            </ButtonLink>
            <Button variant="ghost" onClick={() => router.push('/jeu')}>
              Retour à l’accueil
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell active="accueil">
      <div className="flex max-w-2xl flex-col gap-8">
        <header>
          <p className="text-[11px] uppercase tracking-[0.16em] text-cream/50">Nouvelle partie</p>
          <h1 className="mt-2 font-serif text-[clamp(30px,4.5vw,44px)] leading-[1.05]">
            Votre partie
          </h1>
        </header>

        {/*
          Les thèmes. Cases à cocher et non boutons radio : la sélection est
          multiple, et un lecteur d'écran doit entendre « coché / non
          coché », pas « sélectionné parmi ». Zéro coché est un état
          valide — il vaut « toute la banque » — donc aucune case n'est
          pré-remplie et rien ne bloque le bouton de lancement.
        */}
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="font-serif text-2xl">De quoi voulez-vous parler ?</h2>
            <p className="mt-1 text-sm leading-relaxed text-cream/60">
              Choisissez un thème ou plusieurs. Sans sélection, la partie pioche dans toute la
              banque.
            </p>
          </div>

          <div role="group" aria-label="Thèmes de la partie" className="grid gap-3 sm:grid-cols-2">
            {THEMES.map((theme) => {
              const coche = themes.includes(theme.nom);
              // Tant que le palier n'est pas connu, rien n'est verrouillé.
              const ferme = ouverts !== null && !ouverts.includes(theme.nom);
              const palier = palierDuTheme(theme.nom);
              return (
                <button
                  key={theme.nom}
                  type="button"
                  role="checkbox"
                  aria-checked={coche}
                  aria-disabled={ferme}
                  disabled={ferme}
                  onClick={() => setThemes(basculerTheme(themes, theme.nom))}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    ferme
                      ? 'cursor-not-allowed border-cream/8 bg-plum-card/20 opacity-55'
                      : coche
                        ? 'border-gold bg-plum-card'
                        : 'border-cream/14 bg-plum-card/50 hover:border-cream/30'
                  }`}
                >
                  {/*
                    Sur une carte fermée, on nomme le palier qui l'ouvre —
                    « Essentiel », pas « payant ». Un joueur à qui l'on dit
                    lequel des trois suffit n'a pas à aller comparer la
                    grille de tarifs pour le découvrir.
                  */}
                  {/*
                    12 px sous `md`, 10 px au-delà. Le sur-titre à 10 px est
                    l'idiome du système de design et il tient sur un écran
                    d'ordinateur, mais celui-ci n'est pas décoratif : il dit
                    QUEL pack ouvre ce thème, donc c'est la ligne qu'on lit
                    avant de décider. Mesuré à 360 px, 10 px y est à la limite
                    du lisible. Les sur-titres purement décoratifs restent
                    inchangés — ce n'est pas l'échelle typographique qu'on
                    corrige ici, c'est une information qu'on rend lisible.
                  */}
                  <span className="text-[10px] uppercase tracking-[0.14em] text-cream/45 max-md:text-[12px]">
                    {ferme ? `Verrouillé · ${palier?.nom ?? 'payant'}` : (palier?.nom ?? '')}
                  </span>
                  <span className="mt-1 block font-serif text-lg leading-tight">{theme.nom}</span>
                  <span className="mt-1.5 block text-[13px] leading-relaxed text-cream/55">
                    {theme.resume}
                  </span>
                </button>
              );
            })}
          </div>

          {/*
            Les paliers sont affichés parce qu'ils existent dans le produit
            annoncé, et ils ne bloquent rien parce que l'économie de points
            n'est pas livrée. Le dire vaut mieux qu'une pastille « Pack »
            que le joueur croirait payante — et mieux qu'un paywall qui ne
            prélèverait rien, ce que le bloc « partie offerte » de cet
            écran refuse déjà par ailleurs.
          */}
          <p className="text-[13px] leading-relaxed text-cream/45">
            {ouverts !== null && ouverts.length === 1 && ouverts[0] === THEME_DECOUVERTE ? (
              <>
                Votre essai porte sur un seul thème.{' '}
                <Link href="/tarifs" className="text-gold underline underline-offset-4">
                  Voir les packs
                </Link>{' '}
                pour ouvrir les autres.
              </>
            ) : (
              <>
                Un thème verrouillé s’ouvre avec le pack indiqué sur sa carte.{' '}
                <Link href="/tarifs" className="text-gold underline underline-offset-4">
                  Voir les packs
                </Link>
                .
              </>
            )}
          </p>
        </section>

        <div className="h-px bg-cream/10" />

        <h2 className="font-serif text-2xl">Vous avez combien de temps ?</h2>

        {/*
          A radiogroup, not a list of buttons: these are three values of one
          setting, and a screen reader should hear them that way — one stop
          in the tab order, arrows to move between options.
        */}
        <div role="radiogroup" aria-label="Format de la partie" className="flex flex-col gap-3">
          {GAME_FORMATS.map((format) => {
            const selected = format.id === choice;
            const isDefault = format.id === DEFAULT_FORMAT_ID;
            return (
              <button
                key={format.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setChoice(format.id)}
                className={`rounded-2xl border p-5 text-left transition-colors ${
                  selected
                    ? 'border-gold bg-plum-card'
                    : 'border-cream/14 bg-plum-card/50 hover:border-cream/30'
                }`}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-serif text-xl">{format.label}</span>
                  {isDefault && (
                    <span className="shrink-0 rounded-full border border-rose/34 px-2.5 py-0.5 text-[11px] font-semibold text-rose max-md:text-[12px]">
                      Recommandé
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-cream/70">
                  {format.totalQuestions} questions · {format.minutes} min
                </p>
                <p className="mt-2 text-sm leading-relaxed text-cream/55">{format.blurb}</p>
              </button>
            );
          })}
        </div>

        <section className="rounded-2xl border border-cream/12 bg-plum-card2 p-5">
          <p className="text-[10px] uppercase tracking-[0.14em] text-cream/50">
            Deux jokers chacun
          </p>
          <p className="mt-2 text-sm leading-relaxed text-cream/65">
            Une question vous met mal à l’aise ? Vous passez, sans perdre un point.
          </p>
        </section>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button onClick={launch} disabled={creating}>
            {creating ? 'Préparation…' : 'Lancer la partie'}
          </Button>
          <button
            type="button"
            onClick={() => router.push('/jeu')}
            className="text-sm text-cream/60 underline underline-offset-4 hover:text-gold"
          >
            Retour
          </button>
        </div>
      </div>
    </AppShell>
  );
}
