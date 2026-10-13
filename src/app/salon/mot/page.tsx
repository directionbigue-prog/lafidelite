'use client';

// /salon/mot — l'écran de jeu.
//
// Le moteur tourne ici, dans le navigateur : choisir un mot, tenter une
// réponse, passer à la manche suivante s'appliquent immédiatement, sans
// attendre le réseau. La sauvegarde part ensuite, en tâche de fond, et son
// échec ne coûte que la reprise — jamais le geste.
//
// Cette page ne contient AUCUNE règle : elle appelle `validerSaisie`,
// `choisirMot`, `tenterMot`, `passerManche`, `issue` et `marquerTentative`.
// Une règle recopiée ici finirait par diverger de celle que vérifient les
// invariants du moteur (voir la spec,
// docs/superpowers/specs/2026-09-10-le-mot-design.md).
//
// ── Ce que Le Mot ajoute, et que les trois autres jeux du Salon n'avaient
//    pas ───────────────────────────────────────────────────────────────
// C'est le premier jeu du Salon à information cachée : le mot à deviner
// est dans l'état, donc dans le navigateur du devineur, qui pourrait le
// lire dans les outils de développement. La spec l'assume explicitement —
// le pass-and-play suppose déjà cette confiance — mais cela impose une
// discipline à CET écran : ne JAMAIS rendre `manche.mot` en JSX tant que
// la manche n'est pas terminée. `marquerTentative` compare les lettres
// sans jamais exposer le mot lui-même ; il n'est révélé qu'à `fin-manche`
// et `fin-partie`, une fois qu'il n'y a plus rien à cacher.
//
// La phase d'écran (choisir, passer l'appareil, deviner, fin de manche,
// fin de partie) est calculée par `phaseEcran` (`lib/mot/ecran.ts`), une
// fonction PURE testée pour elle-même — voir son en-tête pour pourquoi
// cette décision ne vit pas ici, dans du JSX qu'aucun test ne peut monter.
//
// Ground ink, comme tout le produit : Le Salon garde un seul habillage
// pour ses jeux, et c'est celui de l'application. L'écran des dames dit
// pourquoi le fond crème d'origine a été repris.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/AuthContext';
import { api, ApiError } from '@/lib/api';
import { FocusLayout } from '@/components/ui/FocusLayout';
import { CommentJouer } from '@/components/salon/CommentJouer';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import {
  LONGUEUR_MOT,
  TENTATIVES_MAX,
  mancheActuelle,
  positionDepart,
  type Joueur,
} from '@/lib/mot/etat';
import { parseEtatMot } from '@/lib/mot/etat-schema';
import { validerSaisie, type RaisonRefus } from '@/lib/mot/dictionnaire';
import {
  choisirMot,
  issue,
  mancheTerminee,
  passerManche,
  tentativesPourTrouver,
  tenterMot,
  type Issue,
} from '@/lib/mot/partie';
import { marquerTentative, type StatutLettre } from '@/lib/mot/marquage';
import { appareilConfirmeInitial, phaseEcran, type MancheAvecMot } from '@/lib/mot/ecran';
import { commencerPartie, sauvegarderEtat, terminerPartie } from '@/lib/salon/api';
import type { EtatMot } from '@/lib/mot/etat';

import { nomDuSecondJoueur, type CoupleMeResponse } from '@/lib/salon/second-joueur';
import { MESSAGE_SALON_VERROUILLE } from '@/lib/salon/verrou';

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
        return MESSAGE_SALON_VERROUILLE;
      case 'INVALID_KIND':
        return 'Ce jeu n’est pas disponible pour le moment.';
      default:
        return 'Impossible de charger la partie. Vérifiez votre connexion, puis réessayez.';
    }
  }
  return 'Impossible de charger la partie. Vérifiez votre connexion, puis réessayez.';
}

/** Le message affiché quand une saisie est refusée — jamais un essai consommé pour l'obtenir. */
function messageRefusSaisie(raison: RaisonRefus): string {
  return raison === 'longueur'
    ? `Il faut un mot de ${LONGUEUR_MOT} lettres.`
    : 'Ce mot n’existe pas dans notre dictionnaire — la tentative n’a pas été comptée.';
}

const SIGNE: Record<StatutLettre, string> = { 'bien-place': '✓', present: '≈', absent: '·' };
const NOM_STATUT: Record<StatutLettre, string> = {
  'bien-place': 'bien placée',
  present: 'présente ailleurs',
  absent: 'absente',
};
const STYLE_STATUT: Record<StatutLettre, string> = {
  'bien-place': 'border-gold bg-gold text-ink',
  present: 'border-rose bg-rose/30 text-cream',
  absent: 'border-cream/12 bg-cream/5 text-cream/45',
};

/**
 * Une lettre marquée. Le signe et le nom accessible existent pour la même
 * raison : le marquage ne doit JAMAIS reposer sur la seule couleur — voir
 * la spec — donc chaque tuile porte un symbole visible en plus de sa
 * teinte, et un nom que lit un lecteur d'écran.
 */
function TuileLettre({
  lettre,
  statut,
}: {
  readonly lettre: string;
  readonly statut: StatutLettre;
}) {
  return (
    <span
      aria-label={`${lettre}, ${NOM_STATUT[statut]}`}
      className={`flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-xl border text-lg font-bold uppercase ${STYLE_STATUT[statut]}`}
    >
      <span aria-hidden>{lettre}</span>
      <span aria-hidden className="text-[10px] font-normal normal-case leading-none">
        {SIGNE[statut]}
      </span>
    </span>
  );
}

/** Une tentative déjà faite, marquée lettre par lettre contre le mot secret. */
function LigneTentative({ mot, tentative }: { readonly mot: string; readonly tentative: string }) {
  const marquage = marquerTentative(mot, tentative);
  return (
    <div className="flex gap-1.5">
      {marquage.map((lm, i) => (
        <TuileLettre key={i} lettre={lm.lettre} statut={lm.statut} />
      ))}
    </div>
  );
}

/** Une ligne vide, purement décorative — combien de tentatives restent. */
function LigneVide() {
  return (
    <div aria-hidden className="flex gap-1.5">
      {Array.from({ length: LONGUEUR_MOT }, (_, i) => (
        <span
          key={i}
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-cream/10 text-cream/25"
        >
          —
        </span>
      ))}
    </div>
  );
}

function GrilleTentatives({ manche }: { readonly manche: MancheAvecMot }) {
  const restantes = TENTATIVES_MAX - manche.tentatives.length;
  return (
    <div className="flex w-full flex-col gap-1.5">
      {manche.tentatives.map((tentative, i) => (
        <LigneTentative key={i} mot={manche.mot} tentative={tentative} />
      ))}
      {Array.from({ length: Math.max(0, restantes) }, (_, i) => (
        <LigneVide key={`vide-${i}`} />
      ))}
    </div>
  );
}

/** La phrase d'issue, une fois la partie terminée — jamais affichée avant. */
function messageIssue(fin: Issue, noms: Record<Joueur, string>): string {
  if (!fin.fini) return '';
  if (fin.vainqueur === null) return 'Match nul.';
  return `${noms[fin.vainqueur]} l’emporte.`;
}

export default function MotPage() {
  const user = useUser('/connexion');
  const router = useRouter();

  const [partieId, setPartieId] = useState<string | null>(null);
  const [etat, setEtat] = useState<EtatMot>(positionDepart);
  const [compteur, setCompteur] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [nomPartenaire, setNomPartenaire] = useState<string | null>(null);
  const [cloture, setCloture] = useState(false);
  // Vrai une fois que le devineur de la manche EN COURS a confirmé avoir
  // reçu l'appareil — purement local, voir `ecran.ts`.
  const [appareilConfirme, setAppareilConfirme] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [erreurSaisie, setErreurSaisie] = useState<string | null>(null);

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
    // partie précédente ne doit survivre (même défaut documenté sur les
    // écrans des dames et de l'Awalé).
    setSaisie('');
    setErreurSaisie(null);
    commencerPartie('MOT')
      .then((partie) => {
        if (annule) return;
        setPartieId(partie.id);
        // Un état stocké illisible ne doit pas bloquer le joueur : on
        // repart de la position de départ plutôt que d'afficher une erreur
        // qu'il ne peut pas résoudre.
        const etatCharge = parseEtatMot(partie.state) ?? positionDepart();
        setEtat(etatCharge);
        setCompteur(partie.moveCount);
        setAppareilConfirme(appareilConfirmeInitial(etatCharge));
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
        if (!annule) setNomPartenaire(nomDuSecondJoueur(res));
      })
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, [user]);

  const pretAJouer = !chargement && erreur === null && partieId !== null;
  const phase = phaseEcran(etat, appareilConfirme);
  const fin = issue(etat);

  /** Applique un état déjà décidé par le moteur, puis le sauvegarde en tâche de fond. */
  function appliquerEtSauver(suivant: EtatMot) {
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

  function soumettreMotChoisi() {
    const manche = mancheActuelle(etat);
    if (partieId === null || manche.mot !== null) return;
    setErreurSaisie(null);
    const resultat = validerSaisie(saisie);
    if (!resultat.ok) {
      setErreurSaisie(messageRefusSaisie(resultat.raison));
      return;
    }
    const suivant = choisirMot(etat, resultat.mot);
    setSaisie('');
    setAppareilConfirme(false);
    appliquerEtSauver(suivant);
  }

  function soumettreTentative() {
    const manche = mancheActuelle(etat);
    if (partieId === null || manche.mot === null || mancheTerminee(manche)) return;
    setErreurSaisie(null);
    const resultat = validerSaisie(saisie);
    if (!resultat.ok) {
      // Refusée : AUCUN essai consommé, `etat` n'est pas touché.
      setErreurSaisie(messageRefusSaisie(resultat.raison));
      return;
    }
    const suivant = tenterMot(etat, resultat.mot);
    setSaisie('');
    appliquerEtSauver(suivant);
  }

  function continuerVersManche2() {
    if (partieId === null || etat.manches.length >= 2) return;
    const premiere = mancheActuelle(etat);
    if (!mancheTerminee(premiere)) return;
    const suivant = passerManche(etat);
    setAppareilConfirme(false);
    // Repart proprement sur la manche 2 : aucune trace de la manche 1
    // (une erreur de saisie non résolue, par exemple) ne doit y survivre.
    setSaisie('');
    setErreurSaisie(null);
    appliquerEtSauver(suivant);
  }

  function confirmerAppareilRecu() {
    // Purement local : rien à sauvegarder, voir `ecran.ts`.
    setAppareilConfirme(true);
  }

  /** Voir la note de l'Awalé : clôt réellement la partie avant d'en ouvrir une neuve. */
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
        <span className="font-semibold text-gold">Le Mot</span>
      </div>

      <CommentJouer jeu="MOT" nom="Le Mot" />

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
          {/* La zone d'état UNIQUE de cet écran : la phase courante, toujours au même endroit. */}
          <p aria-live="polite" className="w-full text-sm leading-relaxed text-cream/75">
            {phase.kind === 'choix-mot' &&
              `${noms[phase.manche.proposeur]} choisit un mot de ${LONGUEUR_MOT} lettres.`}
            {phase.kind === 'attente-passage' &&
              `Passe l’appareil à ${noms[phase.manche.devineur]}.`}
            {phase.kind === 'deviner' &&
              `${noms[phase.manche.devineur]} devine — tentative ${
                phase.manche.tentatives.length + 1
              } sur ${TENTATIVES_MAX}.`}
            {phase.kind === 'fin-manche' &&
              (tentativesPourTrouver(phase.manche) === null
                ? `${noms[phase.manche.devineur]} n’a pas trouvé. Le mot était « ${phase.manche.mot} ».`
                : `${noms[phase.manche.devineur]} a trouvé en ${tentativesPourTrouver(phase.manche)} tentative${
                    tentativesPourTrouver(phase.manche) === 1 ? '' : 's'
                  }.`)}
            {phase.kind === 'fin-partie' && messageIssue(fin, noms)}
          </p>

          {/*
            Écran de passage d'appareil : masque le mot avant que le
            devineur ne commence. Rien de `manche.mot` n'est rendu ici — la
            moitié de l'ergonomie de ce jeu tient à cette absence.
          */}
          {phase.kind === 'attente-passage' && (
            <div className="flex w-full flex-col items-center gap-6 rounded-2xl bg-wine px-6 py-10 text-center text-cream">
              <h2 className="font-serif text-2xl">
                Passe l’appareil à {noms[phase.manche.devineur]}
              </h2>
              <p className="max-w-xs text-sm text-cream/85">
                Le mot est caché. Personne d’autre que {noms[phase.manche.proposeur]} ne l’a vu.
              </p>
              <Button variant="primary" onClick={confirmerAppareilRecu}>
                C’est bon, j’ai l’appareil
              </Button>
            </div>
          )}

          {phase.kind === 'choix-mot' && (
            <div className="flex w-full flex-col gap-3">
              <label htmlFor="mot-choisi" className="text-sm text-cream/70">
                Un mot de {LONGUEUR_MOT} lettres, que {noms[phase.manche.devineur]} devra deviner.
              </label>
              <input
                id="mot-choisi"
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') soumettreMotChoisi();
                }}
                className="min-h-[48px] rounded-xl border border-cream/22 bg-plum-card px-4 py-3 text-lg uppercase tracking-widest text-cream"
              />
              {erreurSaisie !== null && <Alert tone="error">{erreurSaisie}</Alert>}
              <Button
                variant="primary"
                onClick={soumettreMotChoisi}
                disabled={saisie.trim() === ''}
              >
                Valider le mot
              </Button>
            </div>
          )}

          {phase.kind === 'deviner' && (
            <>
              <GrilleTentatives manche={phase.manche} />
              <div className="flex w-full flex-col gap-3">
                <input
                  id="tentative"
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
                {erreurSaisie !== null && <Alert tone="error">{erreurSaisie}</Alert>}
                <Button
                  variant="primary"
                  onClick={soumettreTentative}
                  disabled={saisie.trim() === ''}
                >
                  Valider la tentative
                </Button>
              </div>
            </>
          )}

          {phase.kind === 'fin-manche' && (
            <>
              <GrilleTentatives manche={phase.manche} />
              <div className="flex w-full flex-col gap-3 pt-1 sm:flex-row">
                <Button variant="primary" onClick={continuerVersManche2}>
                  Manche suivante
                </Button>
              </div>
            </>
          )}

          {phase.kind === 'fin-partie' && (
            <>
              <div className="flex w-full flex-col gap-4">
                {etat.manches.map((manche, i) => {
                  // Extrait dans une constante plutôt que relu sur
                  // `manche.mot` : `noUncheckedIndexedAccess` mis à part,
                  // c'est ce qui laisse TypeScript garder `mot` narrowé à
                  // `string` (et pas `string | null`) jusque dans le
                  // `.map` imbriqué juste en dessous.
                  const { mot } = manche;
                  return (
                    <div key={i} className="flex flex-col gap-1.5">
                      <p className="text-xs text-cream/60">
                        {noms[manche.devineur]} devinait « {mot} »
                        {tentativesPourTrouver(manche) === null
                          ? ' — pas trouvé'
                          : ` — trouvé en ${tentativesPourTrouver(manche)}`}
                      </p>
                      {mot !== null &&
                        manche.tentatives.map((tentative, j) => (
                          <LigneTentative key={j} mot={mot} tentative={tentative} />
                        ))}
                    </div>
                  );
                })}
              </div>

              {/*
                Une partie terminée doit TOUJOURS offrir de repartir sur une
                partie jouable — la propriété critique reprise des dames et
                de l'Awalé.
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

          {phase.kind !== 'fin-manche' && phase.kind !== 'fin-partie' && (
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
