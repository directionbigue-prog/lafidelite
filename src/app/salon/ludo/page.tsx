'use client';

// /salon/ludo — l'écran de jeu.
//
// Le moteur tourne ici, dans le navigateur : le dé se lance et le pion se
// déplace sans attendre le réseau. La sauvegarde part ensuite, en tâche de
// fond, et son échec ne coûte que la reprise — jamais le coup.
//
// Cette page ne contient AUCUNE règle : elle appelle `lancerDe`,
// `passerLaMain`, `coupsLegaux`, `appliquer` et `issue`. Une règle recopiée
// ici finirait par diverger de celle que vérifient les invariants du moteur
// (voir docs/superpowers/specs/2026-09-10-ludo-design.md).
//
// ── Ce que le Ludo ajoute, et que les dames et l'Awalé n'avaient pas ─────
// Le dé fait partie de l'état PERSISTÉ (`etat.de`) : un lancer déjà
// effectué mais pas encore joué survit au rechargement, pour la raison
// documentée dans le moteur — sans ça, recharger la page entre le lancer et
// le déplacement redonnerait un dé, un moyen trivial de relancer jusqu'au
// six. Cet écran ne garde donc AUCUN état local qui doublerait `etat.de` :
// « Lancer le dé » et jouer un pion sont deux gestes distincts, et c'est le
// dé de l'état qui décide lequel des deux est possible maintenant.
//
// `lancer()` peut, en un seul geste, produire trois résultats différents :
//  - un dé à jouer (le cas normal) ;
//  - le tour qui passe tout de suite, sans qu'aucun coup ne soit joué,
//    parce qu'aucun pion ne peut jouer ce dé (fréquent : tous les pions à
//    l'enclos sans six, ou personne d'assez proche de l'arrivée) ;
//  - le tour qui s'annule après un troisième six d'affilée.
// Les trois sont annoncés dans la même zone d'état — jamais un écran figé
// sans explication, qui est le défaut le plus probable de ce jeu.
//
// ── Le plateau n'est PAS la surface de jeu ───────────────────────────────
// Une case du ruban de 52 cases (voir `components/ludo/Plateau.tsx`) fait
// environ 28px sur un téléphone — bien sous les 48px qu'une cible tactile
// s'impose ici. Le choix d'un coup se fait donc dans une RANGÉE DE
// BOUTONS sous le plateau, un par pion jouable (quatre au maximum,
// puisqu'un camp n'a que quatre pions), chacun assez grand pour un pouce
// et nommé dans les mots du jeu (« Avancer le pion de la case 12 à la
// case 15 »), jamais dans ceux du code. Le plateau, lui, redevient un pur
// affichage : il montre où sont les pions, quelles cases sont sûres et ce
// qu'il reste à parcourir, sans plus rien recevoir au clic. Le survol ou
// le focus d'un bouton d'action met en évidence le pion correspondant sur
// le plateau (`pionSurligne`), pour que le lien entre les deux reste
// évident même si le plateau n'est plus cliquable.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/AuthContext';
import { api, ApiError } from '@/lib/api';
import { FocusLayout } from '@/components/ui/FocusLayout';
import { CommentJouer } from '@/components/salon/CommentJouer';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Plateau } from '@/components/ludo/Plateau';
import { pionEn, positionDepart, type Camp, type EtatLudo } from '@/lib/ludo/etat';
import { parseEtatLudo } from '@/lib/ludo/etat-schema';
import { coupsLegaux } from '@/lib/ludo/coups';
import { avancer, caseAbsolue } from '@/lib/ludo/plateau';
import { appliquer, issue, lancerDe, passerLaMain, type Issue } from '@/lib/ludo/partie';
import { commencerPartie, sauvegarderEtat, terminerPartie } from '@/lib/salon/api';

import { nomDuSecondJoueur, type CoupleMeResponse } from '@/lib/salon/second-joueur';
import { MESSAGE_SALON_VERROUILLE } from '@/lib/salon/verrou';

/**
 * Les deux joueurs, chacun avec ses pions arrivés — la progression la plus
 * honnête possible : c'est exactement ce que compte la victoire (quatre
 * pions à l'arrivée), pas un score inventé pour l'occasion.
 */
function JoueurEnTete({
  nom,
  arrives,
  actif,
  aDroite = false,
}: {
  readonly nom: string;
  readonly arrives: number;
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
        <span className="block text-xs tabular-nums text-cream/60">
          {arrives} / 4 pions arrivés
        </span>
      </span>
    </div>
  );
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
        return MESSAGE_SALON_VERROUILLE;
      case 'INVALID_KIND':
        return 'Ce jeu n’est pas disponible pour le moment.';
      default:
        return 'Impossible de charger la partie. Vérifiez votre connexion, puis réessayez.';
    }
  }
  return 'Impossible de charger la partie. Vérifiez votre connexion, puis réessayez.';
}

/**
 * La zone d'état UNIQUE de cet écran (voir l'en-tête) : le trait ou
 * l'issue, puis — tant que la partie continue — ce qu'il y a à faire avec
 * le dé courant. Extraite en fonction pure pour que le texte de chaque
 * situation reste testable sans monter le composant.
 */
function statutTour(
  etat: EtatLudo,
  noms: Record<Camp, string>,
  nulle: boolean,
  fin: Issue,
): string {
  if (nulle) return 'Match nul, d’un commun accord.';
  if (fin.fini) return `${noms[fin.vainqueur]} l’emporte.`;
  const base = `À ${noms[etat.trait]} de jouer.`;
  if (etat.de === null) return `${base} Lancez le dé.`;
  return `${base} Un ${etat.de}. Choisissez un pion à avancer.`;
}

/**
 * Le texte d'un bouton d'action — dans les mots du jeu, jamais ceux du
 * code : le joueur choisit son pion sans avoir à déchiffrer le plateau.
 *
 * N'invente aucune règle : `avancer`/`caseAbsolue` sont les mêmes
 * fonctions de géométrie pure que `lib/ludo/partie.ts` applique déjà au
 * pion joué (voir son `appliquer`) — cette fonction se contente de les
 * relire pour DÉCRIRE le coup, jamais pour en juger la légalité (déjà
 * tranchée par `coupsLegaux`, en amont).
 */
function descriptionCoup(etat: EtatLudo, index: number): string {
  const camp = etat.trait;
  const de = etat.de;
  if (de === null) throw new Error('descriptionCoup appelée sans dé en attente');
  const pion = pionEn(etat.pions[camp], index);
  if (pion.zone === 'enclos') return 'Sortir un pion de l’enclos';
  if (pion.zone === 'arrivee') {
    // `coupPossiblePourPion` exclut déjà ce cas de `jouables` — cette
    // branche n'existe que parce que `pionEn` rend un `Pion` générique,
    // pas parce qu'elle peut se produire pour un index réellement jouable.
    throw new Error('Un pion déjà arrivé n’a aucun coup à décrire');
  }
  const caseDepart = caseAbsolue(camp, pion.progression);
  const nouveauPion = avancer(pion, de);
  if (nouveauPion.zone === 'arrivee') return 'Rentrer à l’arrivée';
  if (nouveauPion.zone === 'colonne') {
    return pion.zone === 'circuit'
      ? `Avancer le pion de la case ${caseDepart} vers la colonne d’arrivée`
      : 'Avancer le pion dans la colonne d’arrivée';
  }
  if (nouveauPion.zone === 'circuit') {
    return `Avancer le pion de la case ${caseDepart} à la case ${caseAbsolue(camp, nouveauPion.progression)}`;
  }
  // `avancer` ne rend jamais `enclos` : un pion sorti de l'enclos n'y
  // retourne pas. Cette branche n'existe que pour la garde d'exhaustivité.
  throw new Error('Destination de coup inattendue');
}

export default function LudoPage() {
  const user = useUser('/connexion');
  const router = useRouter();

  const [partieId, setPartieId] = useState<string | null>(null);
  const [etat, setEtat] = useState<EtatLudo>(positionDepart);
  const [compteur, setCompteur] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [nomPartenaire, setNomPartenaire] = useState<string | null>(null);
  // Nulle par accord — un état local, car aucune position ne la décrit.
  const [nulle, setNulle] = useState(false);
  // Une clôture est en cours côté serveur. Sert à ne pas lancer deux fois
  // la même requête sur un double clic, et à ne pas laisser un bouton
  // paraître inerte pendant l'aller-retour.
  const [cloture, setCloture] = useState(false);
  // L'index du pion dont le bouton d'action est survolé ou focalisé — pour
  // le mettre en évidence sur le plateau (`Plateau.pionSurligne`). Purement
  // visuel : ne survit à aucune transition d'état, une rangée de boutons
  // reconstruite après un lancer ou un coup ne garde jamais un survol qui
  // désignerait un bouton disparu.
  const [survol, setSurvol] = useState<number | null>(null);

  // `sud` ouvre toujours la partie, donc il revient à celui qui la lance.
  const noms: Record<Camp, string> = {
    sud: user?.name ?? 'Vous',
    nord: nomPartenaire ?? 'Votre partenaire',
  };

  // Création ou reprise : la route POST est idempotente, un seul appel
  // couvre les deux cas.
  const charger = useCallback((): (() => void) => {
    let annule = false;
    setChargement(true);
    setErreur(null);
    // Un chargement repart d'un affichage propre. `nulle` n'existe dans
    // aucune position — laissé à `true`, il ferait annoncer une nulle sur
    // une partie rechargée toujours jouable, avec les seuls boutons de fin
    // (la même impasse déjà documentée aux dames et à l'Awalé). `message`
    // commenterait un geste (un lancer, un coup) qui n'a plus de plateau.
    setNulle(false);
    setMessage(null);
    setSurvol(null);
    commencerPartie('LUDO')
      .then((partie) => {
        if (annule) return;
        setPartieId(partie.id);
        // Un état stocké illisible ne doit pas bloquer le joueur : on
        // repart de la position de départ plutôt que d'afficher une erreur
        // qu'il ne peut pas résoudre.
        setEtat(parseEtatLudo(partie.state) ?? positionDepart());
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

  // Le prénom du partenaire ne sert qu'à annoncer le trait. Son absence
  // coûte une étiquette, jamais la partie.
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

  // Le plateau n'est jouable que si une partie existe réellement côté
  // serveur — même garde qu'aux dames et à l'Awalé.
  const pretAJouer = !chargement && erreur === null && partieId !== null;

  const fin = issue(etat);
  const termine = nulle || fin.fini;

  const arrivees = useMemo(() => {
    const compte = (camp: Camp) =>
      etat.pions[camp].filter((pion) => pion.zone === 'arrivee').length;
    return { sud: compte('sud'), nord: compte('nord') };
  }, [etat]);

  // Les pions du camp au trait jouables avec le dé en attente. Vide dès que
  // la partie est terminée ou qu'aucun dé n'attend d'être joué.
  const jouables = useMemo(
    () => (termine || etat.de === null ? [] : coupsLegaux(etat)),
    [etat, termine],
  );

  /**
   * Lance le dé pour le camp au trait, et résout tout de suite les deux cas
   * où aucun coup ne suivra :
   *  - le troisième six d'affilée annule le tour (`lancerDe` s'en occupe
   *    déjà, cette fonction ne fait que le remarquer pour l'annoncer) ;
   *  - aucun pion du camp au trait ne peut jouer ce dé précis
   *    (`coupsLegaux` vide) : la main passe, sans qu'aucun coup ne soit
   *    joué. La spec le dit fréquent — ce n'est jamais un cas d'erreur, et
   *    il ne doit jamais se lire comme un écran figé.
   * Dans les deux cas, l'état sauvegardé ne porte donc jamais un dé que
   * personne ne peut jouer.
   */
  const lancer = useCallback(() => {
    if (partieId === null || termine || etat.de !== null) return;
    const traitAvant = etat.trait;
    let suivant = lancerDe(etat, () => Math.random());
    let msg: string | null = null;
    if (suivant.trait !== traitAvant) {
      msg = `Trois six d’affilée : le tour de ${noms[traitAvant]} est annulé. Au tour de ${noms[suivant.trait]}.`;
    } else if (coupsLegaux(suivant).length === 0) {
      const deJoue = suivant.de;
      suivant = passerLaMain(suivant);
      msg = `Aucun coup possible avec ce ${deJoue}, au tour de ${noms[suivant.trait]}.`;
    }
    const prochain = compteur + 1;
    setEtat(suivant);
    setCompteur(prochain);
    setMessage(msg);
    // La rangée de boutons d'action va être reconstruite avec ce nouveau
    // dé : un survol qui désignait un pion de l'ancienne rangée n'a plus
    // de sens.
    setSurvol(null);

    // La sauvegarde part sans être attendue : au pire on perd la reprise,
    // jamais le coup.
    sauvegarderEtat(partieId, suivant, prochain).catch(() => undefined);
  }, [partieId, termine, etat, compteur, noms]);

  /**
   * Joue le pion `index` du camp au trait avec le dé en attente.
   *
   * Un six fait rejouer le MÊME camp — `appliquer` le sait déjà, cette
   * fonction ne fait que l'annoncer, sinon rien à l'écran n'expliquerait
   * pourquoi c'est encore à lui de jouer.
   */
  const jouerPion = useCallback(
    (index: number) => {
      if (partieId === null || termine || etat.de === null) return;
      // Défense en profondeur : le plateau ne rend déjà cliquables que les
      // pions de `jouables`, mais un état React en retard sur un double
      // rendu ne doit jamais faire jouer un coup illégal.
      if (!jouables.includes(index)) return;

      const de = etat.de;
      const camp = etat.trait;
      const suivant = appliquer(etat, index);
      const prochain = compteur + 1;
      setEtat(suivant);
      setCompteur(prochain);
      setMessage(
        de === 6 && suivant.trait === camp
          ? `Six : ${noms[camp]} rejoue — lancez le dé de nouveau.`
          : null,
      );
      // Le pion joué disparaît de la rangée d'action (nouveau dé, ou tour
      // suivant) : un survol qui le désignait n'a plus de cible.
      setSurvol(null);

      sauvegarderEtat(partieId, suivant, prochain).catch(() => undefined);
      // La clôture part de même — c'est un raccourci, pas la garantie. Si
      // elle est perdue, la base garde une partie `IN_PROGRESS` sur une
      // position terminale ; le rattrapage est `nouvellePartie()`.
      if (issue(suivant).fini) terminerPartie(partieId, 'COMPLETED').catch(() => undefined);
    },
    [partieId, termine, etat, jouables, compteur, noms],
  );

  /**
   * Clôt la partie affichée, puis en ouvre une neuve.
   *
   * Même rattrapage qu'aux dames et à l'Awalé : `jouerPion` lance la
   * clôture en tâche de fond, et si elle échoue — onglet fermé sur le coup
   * gagnant, 500, coupure — la base garde une partie `IN_PROGRESS` sur une
   * position TERMINALE, et l'index unique partiel interdit d'en créer une
   * seconde. Ce bouton referme pour de bon la partie affichée avant d'en
   * ouvrir une neuve ; la requête est donc ATTENDUE, et son échec montré
   * plutôt qu'avalé — un bouton qui prétend agir sans agir est ce qui crée
   * l'impasse. La route `/end` est sûre à rejouer, donc « Réessayer » ne
   * coûte rien.
   */
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
    // La remise à zéro de l'affichage appartient à `charger()`, qui la doit
    // à TOUS ses appelants — « Réessayer » compris.
    charger();
  }

  async function abandonner() {
    if (partieId === null || cloture) return;
    setCloture(true);
    try {
      await terminerPartie(partieId, 'ABANDONED');
    } catch {
      // Ne pas partir vers le Salon sur un échec : le joueur croirait la
      // partie abandonnée et la retrouverait intacte au retour.
      setCloture(false);
      setErreur('Impossible d’abandonner la partie. Vérifiez votre connexion, puis réessayez.');
      return;
    }
    router.push('/salon');
  }

  // Nulle par accord — remplace l'absence de règle de répétition (aucune
  // n'existe au Ludo, la spec ne prévoit d'ailleurs aucun match nul par les
  // règles elles-mêmes) : les parties qui s'éternisent se règlent ici.
  async function matchNul() {
    setNulle(true);
    setMessage(null);
    if (partieId === null || cloture) return;
    setCloture(true);
    try {
      await terminerPartie(partieId, 'COMPLETED');
    } catch {
      setMessage(
        'La nulle est actée entre vous, mais elle n’a pas pu être enregistrée. « Nouvelle partie » réessaiera.',
      );
    }
    setCloture(false);
  }

  if (!user) return null;

  return (
    <FocusLayout ground="ink" align="top">
      <div className="flex w-full items-center justify-between text-sm">
        <Link href="/salon" className="text-cream/70 underline-offset-4 hover:underline">
          ← Salon
        </Link>
        <span className="font-semibold text-gold">Ludo</span>
      </div>

      <CommentJouer jeu="LUDO" nom="Ludo" />

      {chargement && <p className="py-16 text-center text-sm text-cream/60">Chargement…</p>}

      {/*
        La partie n'a pas pu être créée ou reprise. Pas de plateau derrière
        ce message : des pions qui accepteraient les clics sans qu'aucune
        partie n'existe sont la promesse la plus facile à rompre par
        accident.
      */}
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
              nom={noms.sud}
              arrives={arrivees.sud}
              actif={!termine && etat.trait === 'sud'}
            />
            <JoueurEnTete
              nom={noms.nord}
              arrives={arrivees.nord}
              actif={!termine && etat.trait === 'nord'}
              aDroite
            />
          </div>

          {/*
            Une seule zone d'état, toujours au même endroit : le trait ou
            l'issue, ce qu'il y a à faire avec le dé, et — le temps qu'il
            reste affiché — ce qui vient de se passer (six rejoué, tour
            passé faute de coup, trois six annulés). C'est la zone dont la
            spec exige qu'elle dise clairement le tour qui passe : le défaut
            le plus probable de cet écran serait de se figer en silence.
          */}
          <p aria-live="polite" className="w-full text-sm leading-relaxed text-cream/75">
            {statutTour(etat, noms, nulle, fin)}
            {!termine && message !== null && <span className="text-gold"> {message}</span>}
          </p>

          <div className="flex w-full items-center gap-3">
            <Button variant="primary" onClick={lancer} disabled={termine || etat.de !== null}>
              Lancer le dé
            </Button>
            {!termine && etat.de !== null && (
              <span
                aria-hidden
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-cream/22 bg-plum-card/50 text-lg font-semibold tabular-nums text-cream"
              >
                {etat.de}
              </span>
            )}
          </div>

          <Plateau
            etat={etat}
            pionSurligne={survol !== null ? { camp: etat.trait, index: survol } : null}
            noms={noms}
          />

          {/*
            La surface de jeu : un vrai bouton par pion jouable, jamais le
            plateau lui-même (voir l'en-tête du fichier — une case du ruban
            est trop petite pour rester une cible tactile). Nommé dans les
            mots du jeu, pas ceux du code, pour que choisir un pion ne
            demande jamais de déchiffrer le plateau. Le survol ou le focus
            met en évidence le pion correspondant sur le plateau, au-dessus.
          */}
          {!termine && etat.de !== null && jouables.length > 0 && (
            <div role="group" aria-label="Pions jouables" className="flex w-full flex-col gap-2">
              {jouables.map((index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => jouerPion(index)}
                  onMouseEnter={() => setSurvol(index)}
                  onMouseLeave={() => setSurvol((actuel) => (actuel === index ? null : actuel))}
                  onFocus={() => setSurvol(index)}
                  onBlur={() => setSurvol((actuel) => (actuel === index ? null : actuel))}
                  className="flex min-h-12 w-full items-center rounded-2xl border border-cream/22 bg-plum-card/50 px-4 text-left text-sm font-medium text-cream transition-colors hover:border-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                  {descriptionCoup(etat, index)}
                </button>
              ))}
            </div>
          )}

          {/*
            Une partie terminée doit TOUJOURS offrir de repartir sur une
            partie jouable — la propriété reprise des dames et de l'Awalé :
            sans elle, une clôture perdue en tâche de fond (onglet fermé sur
            le coup gagnant, 500, coupure) enfermerait le couple hors du jeu,
            l'index unique partiel interdisant d'en créer une seconde.
          */}
          <div className="flex w-full flex-col gap-3 pt-1 sm:flex-row">
            {termine && (
              <>
                <Button variant="primary" onClick={nouvellePartie} disabled={cloture}>
                  {cloture ? 'Un instant…' : 'Nouvelle partie'}
                </Button>
                <Button variant="secondary" onClick={() => router.push('/salon')}>
                  Retour au Salon
                </Button>
              </>
            )}
          </div>

          {!termine && (
            <div className="flex w-full flex-wrap gap-4 text-xs text-cream/55">
              <button
                type="button"
                onClick={matchNul}
                disabled={cloture}
                className="underline underline-offset-4 disabled:no-underline disabled:opacity-50"
              >
                Match nul
              </button>
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
