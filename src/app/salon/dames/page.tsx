'use client';

// /salon/dames — l'écran de jeu.
//
// Le moteur tourne ici, dans le navigateur : le coup s'applique
// immédiatement dès qu'il est validé, sans attendre le réseau. La
// sauvegarde part ensuite, en tâche de fond, et son échec ne coûte que la
// reprise — jamais le coup.
//
// Cette page ne contient AUCUNE règle : elle appelle `toucher` pour savoir
// quoi faire d'un clic, et `appliquer` pour jouer. Une règle recopiée ici
// finirait par diverger de celle que testent les 60 tests du moteur.
//
// ── Trois choses viennent du canevas de design ────────────────────────
//  1. Pas de fond à soi : l'écran reste sur l'`ink` du produit.
//
//     Il a d'abord été crème, parce que le canevas montrait le damier sur
//     une page claire. Les quatre jeux suivants ont recopié ce fond, et la
//     rubrique entière a fini hors charte : on quittait un `/salon` sombre
//     pour cinq écrans clairs. Pire, `Alert` n'a pas de version claire —
//     ses trois tons écrivent en `text-cream` — donc chaque message
//     d'erreur s'affichait en crème sur crème, illisible.
//
//     Le fond crème n'est donc pas revenu à la charte par goût : il masquait
//     les erreurs. Il reste réservé aux deux écrans que `FocusLayout`
//     énumère (la manche Scénarios, le passage du téléphone), où la couleur
//     EST le message.
//  2. « Valider le coup » / « Annuler ». Avec la prise obligatoire et les
//     rafles à plusieurs sauts, voir la séquence entière avant de s'y
//     engager est la moitié de l'ergonomie de ce jeu.
//  3. Pas de barre latérale, un simple retour « ← Salon » : pendant une
//     partie, le plateau est la seule chose qui doit demander l'attention.
//
// Le canevas affiche aussi un score de manches (« 7 — 5 ») et un prix en
// points. Ni l'un ni l'autre n'existe : rien ne compte les manches
// gagnées, et l'économie de points n'est pas construite. À la place, deux
// chiffres qui se calculent honnêtement depuis le plateau — les pièces
// restantes de chaque camp.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/AuthContext';
import { api, ApiError } from '@/lib/api';
import { FocusLayout } from '@/components/ui/FocusLayout';
import { CommentJouer } from '@/components/salon/CommentJouer';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Damier } from '@/components/dames/Damier';
import { positionDepart, type Camp, type Coup, type EtatPlateau } from '@/lib/dames/etat';
import { parseEtatPlateau } from '@/lib/dames/etat-schema';
import { coupsLegaux } from '@/lib/dames/coups';
import { appliquer, issue } from '@/lib/dames/partie';
import {
  INTERACTION_VIDE,
  destinations,
  jouables,
  toucher,
  type Interaction,
} from '@/lib/dames/interaction';
import { commencerPartie, sauvegarderEtat, terminerPartie } from '@/lib/salon/api';

import { nomDuSecondJoueur, type CoupleMeResponse } from '@/lib/salon/second-joueur';
import { MESSAGE_SALON_VERROUILLE } from '@/lib/salon/verrou';

/**
 * La pastille de chaque camp, dessinée comme la pièce l'est sur le plateau
 * — mêmes couleurs, même liseré. C'est ce qui relie un prénom à une
 * couleur : sans elle, « À Awa de jouer » n'apprend pas à Awa quelles
 * pièces sont les siennes.
 *
 * Le camp `blanc` du moteur est le camp crème. Son liseré prune le
 * cerne ; sur le fond ink de l'écran, le disque crème ressort seul.
 */
const DISQUE: Record<Camp, string> = {
  blanc: 'bg-cream ring-2 ring-inset ring-plum-deep/45',
  noir: 'bg-wine',
};

function CampEnTete({
  nom,
  disque,
  restantes,
  actif,
  aDroite = false,
}: {
  readonly nom: string;
  readonly disque: string;
  readonly restantes: number;
  readonly actif: boolean;
  readonly aDroite?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-2.5 border-b-2 pb-1.5 ${
        aDroite ? 'flex-row-reverse text-right' : ''
      } ${actif ? 'border-gold' : 'border-transparent opacity-55'}`}
    >
      <span aria-hidden className={`h-6 w-6 shrink-0 rounded-full ${disque}`} />
      <span className="min-w-0">
        <span className="block truncate font-serif text-[19px] leading-tight">{nom}</span>
        <span className="block text-xs tabular-nums text-cream/60">
          {restantes} {restantes === 1 ? 'pièce' : 'pièces'}
        </span>
      </span>
    </div>
  );
}

/**
 * Traduit l'échec du chargement de la partie, pour le joueur — jamais le
 * texte brut de l'erreur. `ApiError.message` porte en réalité le CODE
 * stable renvoyé par le serveur (voir `lib/api.ts` : le wrapper lit
 * `body.error`, pas `body.message`), pas une phrase lisible — l'afficher
 * tel quel montrerait « COUPLE_REQUIRED » à l'écran. On branche donc sur
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

export default function DamesPage() {
  const user = useUser('/connexion');
  const router = useRouter();

  const [partieId, setPartieId] = useState<string | null>(null);
  const [etat, setEtat] = useState<EtatPlateau>(positionDepart);
  const [compteur, setCompteur] = useState(0);
  const [interaction, setInteraction] = useState<Interaction>(INTERACTION_VIDE);
  // Le coup complet, en attente de validation. C'est lui qui distingue
  // « j'ai fini de désigner mon coup » de « je le joue ».
  const [enAttente, setEnAttente] = useState<Coup | null>(null);
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

  // Le camp `blanc` ouvre, donc il revient à celui qui lance la partie.
  const noms: Record<Camp, string> = {
    blanc: user?.name ?? 'Vous',
    noir: nomPartenaire ?? 'Votre partenaire',
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
    // Un chargement repart d'un affichage propre. Ces quatre états sont
    // les marqueurs LOCAUX qui survivraient sinon à la partie qu'ils
    // décrivaient :
    //
    //  - `nulle` n'existe dans aucune position. Laissé à `true`, il faisait
    //    annoncer « Match nul, d'un commun accord » sur une partie
    //    rechargée toujours JOUABLE, avec les seuls boutons de fin —
    //    l'écran mentait sur l'état réel et la partie devenait
    //    irrécupérable sans recharger la page à la main. Chemin :
    //    « Match nul » → /end échoue → « Nouvelle partie » → /end échoue →
    //    « Réessayer ».
    //  - `enAttente` porte un coup calculé sur le plateau PRÉCÉDENT :
    //    survivant au chargement, « Valider le coup » l'appliquerait au
    //    nouveau. C'est le plus grave des quatre.
    //  - `interaction` désignerait une case du plateau précédent,
    //  - `message` commenterait un geste qui n'a plus de plateau.
    setNulle(false);
    setEnAttente(null);
    setInteraction(INTERACTION_VIDE);
    setMessage(null);
    commencerPartie('DAMES')
      .then((partie) => {
        if (annule) return;
        setPartieId(partie.id);
        // Un état stocké illisible ne doit pas bloquer le joueur : on
        // repart de la position de départ plutôt que d'afficher une erreur
        // qu'il ne peut pas résoudre.
        setEtat(parseEtatPlateau(partie.state) ?? positionDepart());
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
        if (!annule) setNomPartenaire(nomDuSecondJoueur(res));
      })
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, [user]);

  // Le plateau n'est jouable que si une partie existe réellement côté
  // serveur. Sans cette garde, un damier resterait cliquable et « Valider
  // le coup » s'activerait normalement après un échec de chargement, alors
  // que `valider()` n'aurait nulle part où sauvegarder le coup — un bouton
  // qui ment. `partieId !== null` est la condition qui compte ; `erreur`
  // et `chargement` ne sont là que pour ne jamais montrer le plateau et le
  // message d'échec en même temps.
  const pretAJouer = !chargement && erreur === null && partieId !== null;

  const fin = issue(etat);
  const termine = nulle || fin.fini;

  // Le plus long coup légal du moment. Nul s'il n'y a aucune prise —
  // c'est ce qui décide d'annoncer, ou non, la prise obligatoire.
  const prisesObligatoires = useMemo(() => {
    if (termine) return 0;
    const longueurs = coupsLegaux(etat).map((coup) => coup.captures.length);
    return longueurs.length === 0 ? 0 : Math.max(...longueurs);
  }, [etat, termine]);

  const restantes = useMemo(() => {
    let blanc = 0;
    let noir = 0;
    for (const c of etat.cases) {
      if (c === null) continue;
      if (c.camp === 'blanc') blanc += 1;
      else noir += 1;
    }
    return { blanc, noir };
  }, [etat]);

  const onCase = useCallback(
    (caseNum: number) => {
      if (termine) return;
      const reaction = toucher(etat, interaction, caseNum);
      if (reaction.type === 'rien') return;
      if (reaction.type === 'refus') {
        setMessage(reaction.message);
        return;
      }
      setMessage(null);
      if (reaction.type === 'selection' || reaction.type === 'rafle') {
        setInteraction(reaction.interaction);
        setEnAttente(null);
        return;
      }
      // Le coup est complet — mais il n'est PAS joué : il attend
      // « Valider le coup ».
      setEnAttente(reaction.coup);
    },
    [etat, interaction, termine],
  );

  function valider() {
    if (enAttente === null || partieId === null) return;
    const suivant = appliquer(etat, enAttente);
    const prochain = compteur + 1;
    setEtat(suivant);
    setCompteur(prochain);
    setInteraction(INTERACTION_VIDE);
    setEnAttente(null);

    // La sauvegarde part sans être attendue : au pire on perd la reprise,
    // jamais le coup.
    sauvegarderEtat(partieId, suivant, prochain).catch(() => undefined);
    // La clôture part de même — c'est un raccourci, pas la garantie. Si
    // elle est perdue (onglet fermé sur le coup gagnant, 500, coupure), la
    // base garde une partie `IN_PROGRESS` sur une position terminale ; le
    // rattrapage est `nouvellePartie()`, qui la referme pour de bon depuis
    // l'écran de fin. C'est ce rattrapage — et non ce `.catch` — qui tient
    // la promesse « on peut toujours repartir sur une partie jouable ».
    if (issue(suivant).fini) terminerPartie(partieId, 'COMPLETED').catch(() => undefined);
  }

  function annuler() {
    setInteraction(INTERACTION_VIDE);
    setEnAttente(null);
    setMessage(null);
  }

  /**
   * Clôt la partie affichée, puis en ouvre une neuve.
   *
   * C'est la sortie de la seule impasse que cet écran pouvait produire.
   * `valider()` lance la clôture en tâche de fond ; si elle échoue — onglet
   * fermé sur le coup gagnant, 500, coupure — la base garde une partie
   * `IN_PROGRESS` sur une position TERMINALE. À la reprise, le moteur la
   * dit finie, donc plus aucun coup n'est jouable, et l'index unique
   * partiel `BoardGame_couple_kind_in_progress_unique` interdit d'en créer
   * une seconde : sans ce bouton, le couple ne pouvait plus jamais jouer
   * aux dames sans une intervention en base.
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
    // La remise à zéro de l'affichage (`nulle`, `enAttente`, `interaction`,
    // `message`) appartient à `charger()`, qui la doit à TOUS ses appelants
    // — « Réessayer » compris. La dupliquer ici ferait croire qu'elle
    // dépend de ce chemin-ci.
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
  // C'est aussi ce qui remplace la règle des 25 coups, non implémentée
  // (voir la spec) : les finales interminables se règlent ici.
  async function matchNul() {
    // La nulle est actée localement d'abord : les deux joueurs sont devant
    // le même écran et viennent de se mettre d'accord à voix haute — un
    // réseau absent ne doit pas les en empêcher.
    setNulle(true);
    setInteraction(INTERACTION_VIDE);
    setEnAttente(null);
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
        <span className="font-semibold text-gold">Jeu de dames</span>
      </div>

      <CommentJouer jeu="DAMES" nom="Jeu de dames" />

      {chargement && <p className="py-16 text-center text-sm text-cream/60">Chargement…</p>}

      {/*
        La partie n'a pas pu être créée ou reprise. Pas de plateau derrière
        ce message : un damier qui accepte les clics sans qu'aucune partie
        n'existe est la promesse la plus facile à rompre par accident.
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
            `aria-live` : le trait change sans que rien ne bouge à l'endroit
            où l'attention se porte.
          */}
          {/*
            Les deux joueurs, chacun à côté de sa propre pièce.

            L'ancien en-tête disait « À Awa de jouer » et posait « 20 — 20 »
            à l'autre bout de la ligne : rien ne reliait Awa à une couleur,
            ni chaque nombre à son camp. Or ce jeu se joue à deux sur un
            seul appareil — au moment où l'écran change de mains, lire d'un
            coup d'œil « c'est mon tour, je suis les pions crème, il m'en
            reste vingt » est la seule chose que cet écran doit vraiment
            réussir.
          */}
          <div className="flex w-full items-end justify-between gap-4">
            <CampEnTete
              nom={noms.blanc}
              disque={DISQUE.blanc}
              restantes={restantes.blanc}
              actif={!termine && etat.trait === 'blanc'}
            />
            <CampEnTete
              nom={noms.noir}
              disque={DISQUE.noir}
              restantes={restantes.noir}
              actif={!termine && etat.trait === 'noir'}
              aDroite
            />
          </div>

          {/*
            Une seule zone d'état, toujours au même endroit : le trait ou
            l'issue, et la prise obligatoire quand elle s'applique. La règle
            qui surprend le plus est annoncée tant qu'elle vaut — pas au
            moment où elle refuse un geste, où elle se lit comme une
            sanction.
          */}
          <p aria-live="polite" className="w-full text-sm leading-relaxed text-cream/75">
            {nulle
              ? 'Match nul, d’un commun accord.'
              : fin.fini
                ? `${noms[fin.vainqueur]} l’emporte.`
                : `À ${noms[etat.trait]} de jouer.`}
            {!termine && prisesObligatoires > 0 && (
              <span className="text-gold">
                {' '}
                La prise est obligatoire —{' '}
                {prisesObligatoires === 1
                  ? 'une pièce à prendre.'
                  : `${prisesObligatoires} pièces à prendre.`}
              </span>
            )}
          </p>

          <Damier
            etat={etat}
            jouables={termine ? [] : jouables(etat, interaction)}
            selection={interaction.selection}
            destinations={termine ? [] : destinations(etat, interaction)}
            onCase={onCase}
            noms={noms}
          />

          {message !== null && (
            <p className="w-full text-sm text-gold" aria-live="polite">
              {message}
            </p>
          )}

          {/*
            Ce que « Valider le coup » va faire, dit avant de le faire.

            Une rafle se désigne en plusieurs clics et peut emporter
            plusieurs pièces ; le bouton s'allumait sans que rien n'annonce
            la portée du coup qu'il allait jouer.
          */}
          {!termine && enAttente !== null && (
            <p className="w-full text-sm text-cream" aria-live="polite">
              {enAttente.captures.length === 0
                ? 'Coup prêt : déplacement simple.'
                : enAttente.captures.length === 1
                  ? 'Coup prêt : une pièce prise.'
                  : `Coup prêt : ${enAttente.captures.length} pièces prises.`}
            </p>
          )}

          {/*
            Une partie terminée doit TOUJOURS offrir de repartir sur une
            partie jouable. C'est la propriété qui manquait : l'écran de fin
            n'avait que « Retour au Salon », et une partie restée
            `IN_PROGRESS` en base sur une position terminale (clôture
            perdue en tâche de fond) enfermait le couple hors du jeu —
            l'index unique partiel interdisant d'en créer une seconde.
          */}
          <div className="flex w-full flex-col gap-3 pt-1 sm:flex-row">
            {termine ? (
              <>
                <Button variant="primary" onClick={nouvellePartie} disabled={cloture}>
                  {cloture ? 'Un instant…' : 'Nouvelle partie'}
                </Button>
                <Button variant="secondary" onClick={() => router.push('/salon')}>
                  Retour au Salon
                </Button>
              </>
            ) : (
              <>
                <Button variant="primary" onClick={valider} disabled={enAttente === null}>
                  Valider le coup
                </Button>
                {/*
                  Rien à annuler tant qu'aucune pièce n'est prise en main :
                  un bouton actif qui ne changerait rien à l'écran est la
                  petite version du défaut que cette page a corrigé ailleurs.
                */}
                <Button
                  variant="secondary"
                  onClick={annuler}
                  disabled={enAttente === null && interaction.selection === null}
                >
                  Annuler
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
