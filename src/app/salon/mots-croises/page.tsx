'use client';

// /salon/mots-croises — l'écran de jeu, cinquième et dernier du Salon.
//
// Le moteur tourne ici, dans le navigateur : tenter un mot ou passer son
// tour s'applique immédiatement, sans attendre le réseau. La sauvegarde
// part ensuite, en tâche de fond, et son échec ne coûte que la reprise —
// jamais le coup.
//
// Cette page ne contient AUCUNE règle : elle appelle `tenterMot`,
// `passerTour`, `partieTerminee`, `issue`, `score`, `grilleAffichee` et
// `definitionsAffichees`. Une règle recopiée ici finirait par diverger des
// invariants du moteur (voir la spec,
// docs/superpowers/specs/2026-09-10-mots-croises-design.md).
//
// ── Pas d'information cachée, à la différence du Mot ─────────────────────
// Les deux joueurs cherchent les mêmes réponses — la partie est symétrique,
// personne ne devine ce que l'autre sait déjà. Il n'y a donc aucun écran de
// passage d'appareil à masquer : la grille et les définitions restent
// affichées en permanence.
//
// ── Choisir une définition, puis saisir un mot ───────────────────────────
// Une seule zone de saisie, pas un champ par définition : à six
// définitions par grille, six champs en permanence auraient surchargé
// l'écran sur un téléphone, et cinq d'entre eux n'auraient jamais servi ce
// tour-ci. Le joueur au trait clique une définition encore sans réponse
// (un vrai bouton, jamais un `<div onClick>` — voir plus bas), ce qui fait
// apparaître le champ unique juste en dessous, déjà rattaché à CETTE
// définition. Cliquer une autre définition avant de valider change
// simplement la cible du champ.
//
// ── La grille reste visible en permanence ────────────────────────────────
// C'est tout l'intérêt des croisements (voir la spec) : les lettres déjà
// posées par un mot trouvé aident à lire les mots qui le croisent, même
// non trouvés. `grilleAffichee` (lib/mots-croises/affichage.ts) ne révèle
// une lettre que si au moins un des mots qui la portent est déjà trouvé —
// cet écran ne fait que l'afficher, jamais recalculer cette règle.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/AuthContext';
import { api, ApiError } from '@/lib/api';
import { FocusLayout } from '@/components/ui/FocusLayout';
import { CommentJouer } from '@/components/salon/CommentJouer';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Grille } from '@/components/mots-croises/Grille';
import {
  definitionA,
  motAttendu,
  positionDepart,
  trouverGrille,
  type Emplacement,
  type EtatMotsCroises,
  type Joueur,
} from '@/lib/mots-croises/etat';
import { parseEtatMotsCroises } from '@/lib/mots-croises/etat-schema';
import {
  estTrouve,
  issue,
  partieTerminee,
  passerTour,
  score,
  tenterMot,
  type Issue,
} from '@/lib/mots-croises/partie';
import {
  definitionsAffichees,
  grilleAffichee,
  type DefinitionAffichee,
} from '@/lib/mots-croises/affichage';
import { GRILLES } from '@/lib/mots-croises/grilles';
import { commencerPartie, sauvegarderEtat, terminerPartie } from '@/lib/salon/api';

interface CoupleMeResponse {
  couple: { partnerName?: string | null } | null;
}

/**
 * Une grille tirée au hasard — utilisée UNIQUEMENT comme repli d'affichage,
 * jamais par le moteur (voir `lib/mots-croises/etat.ts` : `positionDepart`
 * n'appelle jamais `Math.random()`). Ce repli ne sert que si l'état renvoyé
 * par le serveur ne passe pas `parseEtatMotsCroises` — un état illisible ne
 * doit pas bloquer le joueur, il doit repartir sur une grille jouable.
 * Dupliquée depuis `lib/salon/jeux.ts` plutôt qu'importée : ce fichier-là
 * n'est consommé que par les routes, et une poignée de lignes pures coûte
 * moins qu'une dépendance croisée page → route.
 */
function grilleAleatoire(): string {
  const grille = GRILLES[Math.floor(Math.random() * GRILLES.length)];
  if (grille === undefined) {
    throw new Error('Aucune grille de mots croisés disponible.');
  }
  return grille.id;
}

/**
 * Traduit l'échec du chargement de la partie, pour le joueur — jamais le
 * texte brut de l'erreur. `ApiError.message` porte en réalité le CODE
 * stable renvoyé par le serveur (voir `lib/api.ts`) — on branche donc sur
 * `.code`, jamais sur `.message`.
 */
function messageEchecChargement(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      // Le Salon est inclus dans les packs payants. Sans ce cas, le refus
      // tombait dans la branche par défaut et annonçait un problème de
      // connexion — un joueur qui vérifie son wifi pendant que le serveur
      // lui dit, correctement, qu'il n'a pas d'abonnement.
      case 'SALON_LOCKED':
        return 'Le Salon est inclus dans les packs Essentiel, Intégral et Annuel.';
      case 'COUPLE_REQUIRED':
        return 'Il faut un Espace Couple actif pour jouer à deux.';
      case 'INVALID_KIND':
        return 'Ce jeu n’est pas disponible pour le moment.';
      default:
        return 'Impossible de charger la partie. Vérifiez votre connexion, puis réessayez.';
    }
  }
  return 'Impossible de charger la partie. Vérifiez votre connexion, puis réessayez.';
}

/** Les deux joueurs, chacun avec son score — même principe que l'Awalé et le Ludo. */
function JoueurEnTete({
  nom,
  motsTrouves,
  actif,
  aDroite = false,
}: {
  readonly nom: string;
  readonly motsTrouves: number;
  readonly actif: boolean;
  readonly aDroite?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-2.5 border-b-2 pb-1.5 ${
        aDroite ? 'flex-row-reverse text-right' : ''
      } ${actif ? 'border-gold' : 'border-transparent opacity-55'}`}
    >
      <span className="min-w-0">
        <span className="block truncate font-serif text-[19px] leading-tight">{nom}</span>
        <span className="block text-xs tabular-nums text-cream/60">{motsTrouves} / 6 mots</span>
      </span>
    </div>
  );
}

/** La phrase d'issue, une fois la partie terminée — jamais affichée avant. */
function messageIssue(fin: Issue, noms: Record<Joueur, string>): string {
  if (!fin.fini) return '';
  if (fin.vainqueur === null) return 'Match nul.';
  return `${noms[fin.vainqueur]} l’emporte.`;
}

/** Le dernier résultat connu, pour la zone d'état — voir `messageEtat`. */
interface DernierResultat {
  readonly definition: string;
  readonly correct: boolean;
}

/**
 * La zone d'état UNIQUE de cet écran (voir l'en-tête) : le trait ou
 * l'issue, précédé — s'il y en a un — du résultat de la dernière
 * tentative. Extraite en fonction pure pour que le texte de chaque phase
 * se lise (et se teste) d'un coup d'œil, plutôt qu'éclaté dans le JSX.
 */
function messageEtat(
  fin: Issue,
  etat: EtatMotsCroises,
  noms: Record<Joueur, string>,
  selection: Emplacement | null,
  dernierResultat: DernierResultat | null,
): string {
  if (fin.fini) return messageIssue(fin, noms);
  const qualificatif =
    dernierResultat === null
      ? ''
      : `${dernierResultat.correct ? 'Bonne réponse' : 'Mauvaise réponse'} pour « ${dernierResultat.definition} ». `;
  const geste = selection === null ? 'choisit une définition' : 'propose un mot';
  return `${qualificatif}${noms[etat.trait]} ${geste}.`;
}

/** Une définition de la liste — bouton si jouable, simple ligne une fois trouvée. */
function LigneDefinition({
  definition,
  numero,
  selectionnee,
  jouable,
  noms,
  onChoisir,
}: {
  readonly definition: DefinitionAffichee;
  readonly numero: number;
  readonly selectionnee: boolean;
  readonly jouable: boolean;
  readonly noms: Record<Joueur, string>;
  readonly onChoisir: () => void;
}) {
  if (definition.trouve) {
    return (
      <li className="flex min-h-[48px] items-center gap-2 rounded-xl bg-gold/10 px-3 py-2 text-sm text-cream/70">
        <span aria-hidden className="text-gold">
          ✓
        </span>
        <span className="flex-1">
          {numero}. {definition.definition}
        </span>
        <span className="shrink-0 text-xs font-semibold text-cream/55">
          {definition.trouvePar === null ? '' : noms[definition.trouvePar]}
        </span>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        aria-pressed={selectionnee}
        disabled={!jouable}
        onClick={onChoisir}
        className={`flex min-h-[48px] w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          selectionnee
            ? 'border-gold bg-gold/10 text-cream'
            : 'border-cream/14 bg-plum-card/45 text-cream/85 hover:border-gold/60'
        }`}
      >
        {numero}. {definition.definition}
      </button>
    </li>
  );
}

export default function MotsCroisesPage() {
  const user = useUser('/connexion');
  const router = useRouter();

  const [partieId, setPartieId] = useState<string | null>(null);
  const [etat, setEtat] = useState<EtatMotsCroises>(() => positionDepart(grilleAleatoire()));
  const [compteur, setCompteur] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [nomPartenaire, setNomPartenaire] = useState<string | null>(null);
  const [cloture, setCloture] = useState(false);
  const [selection, setSelection] = useState<Emplacement | null>(null);
  const [saisie, setSaisie] = useState('');
  const [dernierResultat, setDernierResultat] = useState<DernierResultat | null>(null);

  // « un » ouvre toujours la partie (voir `positionDepart`), donc il revient
  // à celui qui la lance.
  const noms: Record<Joueur, string> = {
    un: user?.name ?? 'Vous',
    deux: nomPartenaire ?? 'Votre partenaire',
  };

  const charger = useCallback((): (() => void) => {
    let annule = false;
    setChargement(true);
    setErreur(null);
    // Un chargement repart d'un affichage propre — aucun marqueur de la
    // partie précédente ne doit survivre (même défaut documenté aux quatre
    // autres jeux du Salon).
    setSelection(null);
    setSaisie('');
    setDernierResultat(null);
    commencerPartie('MOTS_CROISES')
      .then((partie) => {
        if (annule) return;
        setPartieId(partie.id);
        // Un état stocké illisible ne doit pas bloquer le joueur : on
        // repart d'une grille jouable plutôt que d'afficher une erreur
        // qu'il ne peut pas résoudre.
        const etatCharge = parseEtatMotsCroises(partie.state) ?? positionDepart(grilleAleatoire());
        setEtat(etatCharge);
        setCompteur(partie.moveCount);
      })
      .catch((err: unknown) => {
        if (!annule) setErreur(messageEchecChargement(err));
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });
    return () => {
      annule = true;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    return charger();
  }, [user, charger]);

  useEffect(() => {
    if (!user) return;
    let annule = false;
    api<CoupleMeResponse>('/api/couples/me')
      .then((res) => {
        if (!annule) setNomPartenaire(res.couple?.partnerName ?? null);
      })
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, [user]);

  const pretAJouer = !chargement && erreur === null && partieId !== null;
  const grille = trouverGrille(etat.idGrille);
  const fin = issue(etat);
  const compte = score(etat);
  const cellules = grilleAffichee(etat);
  const definitions = definitionsAffichees(etat);

  /** Applique un état déjà décidé par le moteur, puis le sauvegarde en tâche de fond. */
  function appliquerEtSauver(suivant: EtatMotsCroises) {
    if (partieId === null) return;
    const prochain = compteur + 1;
    setEtat(suivant);
    setCompteur(prochain);
    sauvegarderEtat(partieId, suivant, prochain).catch(() => undefined);
    // La clôture part de même — un raccourci, pas une garantie. Si elle
    // est perdue, la base garde une partie IN_PROGRESS sur une position
    // terminale ; « Nouvelle partie » la referme pour de bon.
    if (issue(suivant).fini) {
      terminerPartie(partieId, 'COMPLETED').catch(() => undefined);
    }
  }

  function choisirDefinition(emplacement: Emplacement) {
    if (partieTerminee(etat) || estTrouve(etat, emplacement)) return;
    setSelection(emplacement);
    setSaisie('');
    setDernierResultat(null);
  }

  function soumettreTentative() {
    if (partieId === null || selection === null || partieTerminee(etat)) return;
    if (estTrouve(etat, selection)) return; // défense en profondeur
    const proposition = saisie.trim();
    if (proposition === '') return;
    const definition = definitionA(grille, selection);
    const resultat = tenterMot(etat, selection, proposition);
    setDernierResultat({ definition, correct: resultat.correct });
    setSelection(null);
    setSaisie('');
    appliquerEtSauver(resultat.etat);
  }

  function passer() {
    if (partieId === null || partieTerminee(etat)) return;
    const suivant = passerTour(etat);
    setSelection(null);
    setSaisie('');
    setDernierResultat(null);
    appliquerEtSauver(suivant);
  }

  /** Voir la note des quatre autres jeux : clôt réellement la partie avant d'en ouvrir une neuve. */
  async function nouvellePartie() {
    if (partieId === null || cloture) return;
    setCloture(true);
    try {
      await terminerPartie(partieId, 'COMPLETED');
    } catch {
      setCloture(false);
      setErreur('Impossible de clore la partie. Vérifiez votre connexion, puis réessayez.');
      return;
    }
    setCloture(false);
    charger();
  }

  async function abandonner() {
    if (partieId === null || cloture) return;
    setCloture(true);
    try {
      await terminerPartie(partieId, 'ABANDONED');
    } catch {
      setCloture(false);
      setErreur('Impossible d’abandonner la partie. Vérifiez votre connexion, puis réessayez.');
      return;
    }
    router.push('/salon');
  }

  if (!user) return null;

  return (
    <FocusLayout ground="ink" align="top">
      <div className="flex w-full items-center justify-between text-sm">
        <Link href="/salon" className="text-cream/70 underline-offset-4 hover:underline">
          ← Salon
        </Link>
        <span className="font-semibold text-gold">Mots croisés</span>
      </div>

      <CommentJouer jeu="MOTS_CROISES" nom="Mots croisés" />

      {chargement && <p className="py-16 text-center text-sm text-cream/60">Chargement…</p>}

      {!chargement && erreur !== null && (
        <div className="flex w-full flex-col items-start gap-4 py-8">
          <Alert tone="error">{erreur}</Alert>
          <div className="flex w-full flex-col gap-3 sm:flex-row">
            <Button variant="primary" onClick={() => charger()}>
              Réessayer
            </Button>
            <Button variant="secondary" onClick={() => router.push('/salon')}>
              Retour au Salon
            </Button>
          </div>
        </div>
      )}

      {pretAJouer && (
        <>
          <div className="flex w-full items-end justify-between gap-4">
            <JoueurEnTete
              nom={noms.un}
              motsTrouves={compte.un}
              actif={!fin.fini && etat.trait === 'un'}
            />
            <JoueurEnTete
              nom={noms.deux}
              motsTrouves={compte.deux}
              actif={!fin.fini && etat.trait === 'deux'}
              aDroite
            />
          </div>

          {/* La zone d'état UNIQUE de cet écran : la phase courante, toujours au même endroit. */}
          <p aria-live="polite" className="w-full text-sm leading-relaxed text-cream/75">
            {messageEtat(fin, etat, noms, selection, dernierResultat)}
          </p>

          {/* La grille reste visible en permanence — voir l'en-tête. */}
          <Grille cellules={cellules} selection={selection} />

          {!fin.fini && (
            <div className="flex w-full flex-col gap-4 sm:flex-row sm:gap-6">
              <div className="flex-1">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-cream/55">
                  Horizontal
                </h2>
                <ul className="flex flex-col gap-1.5">
                  {definitions
                    .filter((d) => d.direction === 'horizontal')
                    .map((d) => (
                      <LigneDefinition
                        key={`${d.direction}-${d.index}`}
                        definition={d}
                        numero={d.index + 1}
                        selectionnee={
                          selection !== null &&
                          selection.direction === d.direction &&
                          selection.index === d.index
                        }
                        jouable={!fin.fini && !d.trouve}
                        noms={noms}
                        onChoisir={() => choisirDefinition(d)}
                      />
                    ))}
                </ul>
              </div>
              <div className="flex-1">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-cream/55">
                  Vertical
                </h2>
                <ul className="flex flex-col gap-1.5">
                  {definitions
                    .filter((d) => d.direction === 'vertical')
                    .map((d) => (
                      <LigneDefinition
                        key={`${d.direction}-${d.index}`}
                        definition={d}
                        numero={d.index + 1}
                        selectionnee={
                          selection !== null &&
                          selection.direction === d.direction &&
                          selection.index === d.index
                        }
                        jouable={!fin.fini && !d.trouve}
                        noms={noms}
                        onChoisir={() => choisirDefinition(d)}
                      />
                    ))}
                </ul>
              </div>
            </div>
          )}

          {!fin.fini && selection !== null && (
            <div className="flex w-full flex-col gap-3">
              <label htmlFor="proposition" className="text-sm text-cream/70">
                Un mot de cinq lettres pour « {definitionA(grille, selection)} ».
              </label>
              <input
                id="proposition"
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') soumettreTentative();
                }}
                className="min-h-[48px] rounded-xl border border-cream/22 bg-plum-card px-4 py-3 text-lg uppercase tracking-widest text-cream"
              />
              <Button
                variant="primary"
                onClick={soumettreTentative}
                disabled={saisie.trim() === ''}
              >
                Valider la réponse
              </Button>
            </div>
          )}

          {!fin.fini && (
            <Button variant="secondary" onClick={passer}>
              Passer son tour
            </Button>
          )}

          {fin.fini && (
            <>
              <ul className="flex w-full flex-col gap-1.5">
                {definitions.map((d) => (
                  <li
                    key={`${d.direction}-${d.index}`}
                    className="flex items-center gap-2 rounded-xl bg-plum-card/55 px-3 py-2 text-xs text-cream/70"
                  >
                    <span className="flex-1">
                      {d.direction === 'horizontal' ? 'H' : 'V'}
                      {d.index + 1}. {d.definition}
                    </span>
                    <span className="shrink-0 font-semibold uppercase tracking-wide text-cream">
                      {motAttendu(grille, d)}
                    </span>
                    <span className="shrink-0 text-cream/55">
                      {d.trouvePar === null ? 'Personne' : noms[d.trouvePar]}
                    </span>
                  </li>
                ))}
              </ul>

              {/*
                Une partie terminée doit TOUJOURS offrir de repartir sur une
                partie jouable — la propriété critique reprise des quatre
                autres jeux.
              */}
              <div className="flex w-full flex-col gap-3 pt-1 sm:flex-row">
                <Button variant="primary" onClick={nouvellePartie} disabled={cloture}>
                  {cloture ? 'Un instant…' : 'Nouvelle partie'}
                </Button>
                <Button variant="secondary" onClick={() => router.push('/salon')}>
                  Retour au Salon
                </Button>
              </div>
            </>
          )}

          {!fin.fini && (
            <div className="flex w-full flex-wrap gap-4 text-xs text-cream/55">
              <button
                type="button"
                onClick={abandonner}
                disabled={cloture}
                className="underline underline-offset-4 disabled:no-underline disabled:opacity-50"
              >
                Abandonner la partie
              </button>
            </div>
          )}
        </>
      )}
    </FocusLayout>
  );
}
