'use client';

// /salon/awale — l'écran de jeu.
//
// Le moteur tourne ici, dans le navigateur : le coup s'applique
// immédiatement dès qu'on clique un trou, sans attendre le réseau. La
// sauvegarde part ensuite, en tâche de fond, et son échec ne coûte que la
// reprise — jamais le coup.
//
// Cette page ne contient AUCUNE règle : elle appelle `coupsLegaux` pour
// savoir quels trous sont jouables et `appliquer` pour jouer. Une règle
// recopiée ici finirait par diverger de celle que testent les invariants du
// moteur (voir `docs/superpowers/specs/2026-09-09-awale-design.md`).
//
// ── Valider / Annuler, et pourquoi cet écran n'en a pas ────────────────
// L'écran des dames voit un coup se composer en plusieurs clics — une
// sélection, puis une ou plusieurs destinations d'une rafle — et gagne
// donc à montrer la séquence entière avant de s'y engager. À l'Awalé, UN
// coup est UN clic : il n'y a rien à composer, donc rien à relire avant de
// valider. Un bouton « Valider » qui suivrait immédiatement chaque clic ne
// protégerait de rien (le clic a déjà tout dit) et ajouterait une étape à
// chaque coup ; un bouton « Annuler » n'aurait rien à annuler tant que rien
// n'est en attente. Le plateau ne rend cliquables que les trous que
// `coupsLegaux` autorise — la seule protection qui ait un sens ici est donc
// en amont du clic, pas après lui. Un coup reste irréversible une fois joué,
// exactement comme aux dames une fois leur propre validation franchie.
//
// Ground ink, comme tout le produit : Le Salon garde un seul habillage
// pour ses jeux, et c'est celui de l'application. L'écran des dames dit
// pourquoi le fond crème d'origine a été repris.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/AuthContext';
import { api, ApiError } from '@/lib/api';
import { FocusLayout } from '@/components/ui/FocusLayout';
import { CommentJouer } from '@/components/salon/CommentJouer';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Plateau } from '@/components/awale/Plateau';
import { adversaire, positionDepart, type Camp, type EtatAwale } from '@/lib/awale/etat';
import { parseEtatAwale } from '@/lib/awale/etat-schema';
import { coupsLegaux, sommeCote } from '@/lib/awale/coups';
import { appliquer, issue } from '@/lib/awale/partie';
import { commencerPartie, sauvegarderEtat, terminerPartie } from '@/lib/salon/api';

interface CoupleMeResponse {
  couple: { partnerName?: string | null } | null;
}

/**
 * Les deux joueurs, chacun à côté de son grenier.
 *
 * Reprend la leçon de l'en-tête des dames : relier un prénom à CE qui lui
 * appartient. Aux dames c'était une couleur de pièce ; ici c'est un
 * grenier — le score est déjà réel, pas de compte de pièces restantes à
 * calculer en proxy.
 */
function JoueurEnTete({
  nom,
  graines,
  actif,
  aDroite = false,
}: {
  readonly nom: string;
  readonly graines: number;
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
          {graines} {graines === 1 ? 'graine' : 'graines'}
        </span>
      </span>
    </div>
  );
}

/**
 * Traduit l'échec du chargement de la partie, pour le joueur — jamais le
 * texte brut de l'erreur. `ApiError.message` porte en réalité le CODE
 * stable renvoyé par le serveur (voir `lib/api.ts` : le wrapper lit
 * `body.error`, pas `body.message`) — on branche donc sur `.code`, jamais
 * sur `.message`.
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

export default function AwalePage() {
  const user = useUser('/connexion');
  const router = useRouter();

  const [partieId, setPartieId] = useState<string | null>(null);
  const [etat, setEtat] = useState<EtatAwale>(positionDepart);
  const [compteur, setCompteur] = useState(0);
  // Le dernier trou joué, pour le seul repère visuel qu'un coup en un clic
  // laisse derrière lui — voir `Plateau`.
  const [dernierCoup, setDernierCoup] = useState<number | null>(null);
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

  // `sud` ouvre toujours la partie, donc il revient à celui qui la lance.
  const noms: Record<Camp, string> = {
    sud: user?.name ?? 'Vous',
    nord: nomPartenaire ?? 'Votre partenaire',
  };

  // Création ou reprise : la route POST est idempotente, un seul appel
  // couvre les deux cas.
  //
  // Extrait en fonction nommée — et pas seulement inlinée dans l'effet —
  // parce que le bouton « Réessayer » doit pouvoir relancer exactement le
  // même chargement après un échec, sans dupliquer la logique.
  const charger = useCallback((): (() => void) => {
    let annule = false;
    setChargement(true);
    setErreur(null);
    // Un chargement repart d'un affichage propre. Ces trois états sont les
    // marqueurs LOCAUX qui survivraient sinon à la partie qu'ils
    // décrivaient — aucune position ne les décrit, donc rien côté serveur
    // ne les corrige au rechargement :
    //
    //  - `nulle` laissé à `true` ferait annoncer « Match nul, d'un commun
    //    accord » sur une partie rechargée toujours JOUABLE, avec les seuls
    //    boutons de fin — la même impasse que documentée sur l'écran des
    //    dames (« Match nul » → /end échoue → « Nouvelle partie » → /end
    //    échoue → « Réessayer »).
    //  - `dernierCoup` désignerait un trou du plateau PRÉCÉDENT — un repère
    //    visuel qui mentirait sur ce qui vient de se jouer.
    //  - `message` commenterait un geste qui n'a plus de plateau.
    setNulle(false);
    setDernierCoup(null);
    setMessage(null);
    commencerPartie('AWALE')
      .then((partie) => {
        if (annule) return;
        setPartieId(partie.id);
        // Un état stocké illisible ne doit pas bloquer le joueur : on
        // repart de la position de départ plutôt que d'afficher une erreur
        // qu'il ne peut pas résoudre.
        setEtat(parseEtatAwale(partie.state) ?? positionDepart());
        setCompteur(partie.moveCount);
      })
      .catch((err: unknown) => {
        // Un échec ici n'est PAS absorbé silencieusement, contrairement à
        // la sauvegarde en tâche de fond plus bas : sans partie créée, il
        // n'y a rien à jouer — le joueur doit le savoir, et savoir quoi
        // faire ensuite (réessayer, ou repartir vers le Salon).
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
        if (!annule) setNomPartenaire(res.couple?.partnerName ?? null);
      })
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, [user]);

  // Le plateau n'est jouable que si une partie existe réellement côté
  // serveur. Sans cette garde, les trous resteraient cliquables après un
  // échec de chargement, alors qu'`onTrou` n'aurait nulle part où
  // sauvegarder le coup — un bouton qui ment. `partieId !== null` est la
  // condition qui compte ; `erreur` et `chargement` ne sont là que pour ne
  // jamais montrer le plateau et le message d'échec en même temps.
  const pretAJouer = !chargement && erreur === null && partieId !== null;

  const fin = issue(etat);
  const termine = nulle || fin.fini;

  // Les trous que le joueur au trait peut jouer maintenant. Vide sur une
  // partie terminée — `coupsLegaux` répondrait déjà vide dans le cas d'une
  // famine sans issue, mais `nulle` (acceptée d'un commun accord) n'existe
  // dans aucune position : sans cette garde explicite, le plateau resterait
  // jouable après une nulle.
  const jouables = useMemo(() => (termine ? [] : coupsLegaux(etat)), [etat, termine]);

  // Vrai quand l'adversaire du joueur au trait n'a plus aucune graine : la
  // seule règle qui restreigne le choix du trou (voir la spec, « Nourrir
  // l'adversaire »). Annoncée pour la même raison que la prise obligatoire
  // aux dames — la règle qui surprend le plus se dit tant qu'elle vaut, pas
  // au moment où elle refuse un geste.
  const nourrissageObligatoire = useMemo(() => {
    if (termine) return false;
    return sommeCote(etat.trous, adversaire(etat.trait)) === 0;
  }, [etat, termine]);

  const onTrou = useCallback(
    (trou: number) => {
      if (termine || partieId === null) return;
      // Défense en profondeur : le plateau ne rend déjà cliquables que les
      // trous de `jouables`, mais un état React en retard sur un double
      // rendu ne doit jamais faire jouer un coup illégal.
      if (!jouables.includes(trou)) return;

      const suivant = appliquer(etat, trou);
      const prochain = compteur + 1;
      setEtat(suivant);
      setCompteur(prochain);
      setDernierCoup(trou);
      setMessage(null);

      // La sauvegarde part sans être attendue : au pire on perd la reprise,
      // jamais le coup.
      sauvegarderEtat(partieId, suivant, prochain).catch(() => undefined);
      // La clôture part de même — c'est un raccourci, pas la garantie. Si
      // elle est perdue (onglet fermé sur le coup gagnant, 500, coupure),
      // la base garde une partie `IN_PROGRESS` sur une position terminale ;
      // le rattrapage est `nouvellePartie()`, qui la referme pour de bon
      // depuis l'écran de fin.
      if (issue(suivant).fini) terminerPartie(partieId, 'COMPLETED').catch(() => undefined);
    },
    [etat, jouables, termine, compteur, partieId],
  );

  /**
   * Clôt la partie affichée, puis en ouvre une neuve.
   *
   * C'est la sortie de la seule impasse que cet écran pouvait produire.
   * `onTrou` lance la clôture en tâche de fond ; si elle échoue — onglet
   * fermé sur le coup gagnant, 500, coupure — la base garde une partie
   * `IN_PROGRESS` sur une position TERMINALE. À la reprise, le moteur la
   * dit finie, donc plus aucun trou n'est jouable, et l'index unique
   * partiel `BoardGame_couple_kind_in_progress_unique` interdit d'en créer
   * une seconde : sans ce bouton, le couple ne pouvait plus jamais jouer à
   * l'Awalé sans une intervention en base.
   *
   * La requête est donc ATTENDUE, et son échec est montré au lieu d'être
   * avalé : un bouton qui prétend agir sans agir est ce qui a créé
   * l'impasse. La route `/end` est sûre à rejouer (`where: { status:
   * 'IN_PROGRESS' }`), donc réessayer ne coûte rien — et l'écran d'échec
   * offre justement « Réessayer ».
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
    // La remise à zéro de l'affichage (`nulle`, `dernierCoup`, `message`)
    // appartient à `charger()`, qui la doit à TOUS ses appelants —
    // « Réessayer » compris. La dupliquer ici ferait croire qu'elle dépend
    // de ce chemin-ci.
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

  // Nulle par accord. Un seul geste suffit : les deux joueurs sont côte à
  // côte devant le même écran et se sont déjà mis d'accord à voix haute —
  // demander une seconde confirmation ne prouverait rien.
  //
  // C'est aussi ce qui remplace la règle de répétition, non implémentée
  // (voir la spec) : les parties interminables se règlent ici.
  async function matchNul() {
    // La nulle est actée localement d'abord : les deux joueurs sont devant
    // le même écran et viennent de se mettre d'accord à voix haute — un
    // réseau absent ne doit pas les en empêcher.
    setNulle(true);
    setDernierCoup(null);
    setMessage(null);
    if (partieId === null || cloture) return;
    setCloture(true);
    try {
      await terminerPartie(partieId, 'COMPLETED');
    } catch {
      // Dire ce qui n'a PAS eu lieu, plutôt que d'avaler l'échec : la
      // partie reste ouverte en base, et c'est « Nouvelle partie » qui
      // rattrapera.
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
        <span className="font-semibold text-gold">Awalé</span>
      </div>

      <CommentJouer jeu="AWALE" nom="Awalé" />

      {chargement && <p className="py-16 text-center text-sm text-cream/60">Chargement…</p>}

      {/*
        La partie n'a pas pu être créée ou reprise. Pas de plateau derrière
        ce message : des trous qui accepteraient les clics sans qu'aucune
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
          {/*
            Les deux joueurs, chacun à côté de son grenier — même principe
            que les dames : au moment où l'écran change de mains, savoir
            d'un coup d'œil « c'est mon tour, voilà mon grenier » est la
            seule chose que cet en-tête doit vraiment réussir.
          */}
          <div className="flex w-full items-end justify-between gap-4">
            <JoueurEnTete
              nom={noms.sud}
              graines={etat.greniers.sud}
              actif={!termine && etat.trait === 'sud'}
            />
            <JoueurEnTete
              nom={noms.nord}
              graines={etat.greniers.nord}
              actif={!termine && etat.trait === 'nord'}
              aDroite
            />
          </div>

          {/*
            Une seule zone d'état, toujours au même endroit : le trait ou
            l'issue, et l'obligation de nourrir quand elle s'applique.
          */}
          <p aria-live="polite" className="w-full text-sm leading-relaxed text-cream/75">
            {nulle
              ? 'Match nul, d’un commun accord.'
              : fin.fini
                ? fin.vainqueur === null
                  ? 'Match nul.'
                  : `${noms[fin.vainqueur]} l’emporte.`
                : `À ${noms[etat.trait]} de jouer.`}
            {!termine && nourrissageObligatoire && (
              <span className="text-gold">
                {' '}
                {noms[etat.trait]} doit nourrir {noms[adversaire(etat.trait)]} — seuls les trous qui
                lui donnent au moins une graine sont jouables.
              </span>
            )}
          </p>

          <Plateau
            etat={etat}
            jouables={jouables}
            dernierCoup={dernierCoup}
            onTrou={onTrou}
            noms={noms}
          />

          {message !== null && (
            <p className="w-full text-sm text-gold" aria-live="polite">
              {message}
            </p>
          )}

          {/*
            Une partie terminée doit TOUJOURS offrir de repartir sur une
            partie jouable — la propriété qui manquait à l'écran des dames
            avant sa correction, et que cet écran-ci reprend dès sa première
            version.
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
