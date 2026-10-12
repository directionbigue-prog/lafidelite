// La couture entre les moteurs et leurs schémas — pour les cinq jeux.
//
// Chaque jeu du Salon suit le même trajet : son moteur produit un état dans
// le navigateur, cet état part en JSON vers `PUT /api/salon/[id]/state`, il
// est relu par le schéma de forme du jeu (`lib/salon/jeux.ts` → `parseEtat`)
// et renvoyé au client au chargement suivant.
//
// Si un moteur produit un état que son PROPRE schéma refuse, `parseEtat`
// rend `null`, et l'écran repart de la position de départ — **sans rien
// dire**. La partie se réinitialise à chaque rechargement et personne ne
// comprend pourquoi. C'est un défaut silencieux, invisible aux tests de
// chaque jeu pris isolément : le moteur est juste, le schéma est juste, et
// c'est leur rencontre qui échoue.
//
// D'où ce fichier, qui est le seul à traverser les cinq jeux à la fois. Il
// est né d'une revue de branche et mérite d'y rester : ajouter un sixième
// jeu sans l'y inscrire laisserait justement le trou qu'il ferme.
//
// Le dernier test pose une question que les autres ne posent pas : le schéma
// d'un jeu accepte-t-il l'état d'un AUTRE jeu ? Il ne doit pas. Sans quoi
// une partie de dames pourrait avaler un plateau d'Awalé sans protester, et
// la garde de forme ne garderait plus rien.
import { describe, expect, it } from 'vitest';

import { parseEtatPlateau } from '@/lib/dames/etat-schema';

import { positionDepart as departAwale } from '@/lib/awale/etat';
import { parseEtatAwale } from '@/lib/awale/etat-schema';
import { coupsLegaux as coupsAwale } from '@/lib/awale/coups';
import { appliquer as appliquerAwale, issue as issueAwale } from '@/lib/awale/partie';

import { positionDepart as departLudo } from '@/lib/ludo/etat';
import { parseEtatLudo } from '@/lib/ludo/etat-schema';
import { coupsLegaux as coupsLudo } from '@/lib/ludo/coups';
import {
  appliquer as appliquerLudo,
  issue as issueLudo,
  lancerDe,
  passerLaMain,
} from '@/lib/ludo/partie';

import { positionDepart as departMot } from '@/lib/mot/etat';
import { parseEtatMot } from '@/lib/mot/etat-schema';
import { choisirMot, mancheTerminee, passerManche, tenterMot } from '@/lib/mot/partie';
import motsJson from '@/lib/mot/mots-cinq-lettres.json';

import {
  motAttendu,
  positionDepart as departMotsCroises,
  tousLesEmplacements,
  trouverGrille,
} from '@/lib/mots-croises/etat';
import { parseEtatMotsCroises } from '@/lib/mots-croises/etat-schema';
import {
  issue as issueMotsCroises,
  partieTerminee,
  tenterMot as tenterMotsCroises,
} from '@/lib/mots-croises/partie';
import { GRILLES } from '@/lib/mots-croises/grilles';

/** Générateur reproductible : un échec doit pouvoir être rejoué à l'identique. */
function alea(graine: number): () => number {
  let etat = graine >>> 0;
  return () => {
    etat = (etat * 1664525 + 1013904223) >>> 0;
    return etat / 4294967296;
  };
}

/** Le trajet réel d'un état : sérialisé en JSON, puis relu par son schéma. */
function survitAuTrajet<T>(etat: unknown, relire: (valeur: unknown) => T | null): boolean {
  return relire(JSON.parse(JSON.stringify(etat)) as unknown) !== null;
}

describe('la couture entre chaque moteur et son schéma de forme', () => {
  it('tient sur 200 parties d’Awalé jouées au hasard', () => {
    const echecs: string[] = [];
    for (let partie = 0; partie < 200; partie += 1) {
      const tirage = alea(partie + 1);
      let etat = departAwale();
      for (let coup = 0; coup < 500 && !issueAwale(etat).fini; coup += 1) {
        const legaux = coupsAwale(etat);
        const choisi = legaux[Math.floor(tirage() * legaux.length)];
        if (choisi === undefined) break;
        etat = appliquerAwale(etat, choisi);
        if (!survitAuTrajet(etat, parseEtatAwale)) {
          echecs.push(`Awalé, partie ${partie}, coup ${coup}`);
          break;
        }
      }
    }
    expect(echecs).toEqual([]);
  });

  it('tient sur 200 parties de Ludo jouées au hasard, après le lancer comme après le coup', () => {
    // Le Ludo a deux moments où l'état change — le lancer, puis le
    // déplacement — et le dé lancé fait PARTIE de l'état persisté. Les deux
    // moments doivent donc survivre au trajet, pas seulement le second.
    const echecs: string[] = [];
    for (let partie = 0; partie < 200; partie += 1) {
      const tirage = alea(partie + 77);
      let etat = departLudo();
      for (let tour = 0; tour < 4000 && !issueLudo(etat).fini; tour += 1) {
        const avant = etat.trait;
        let apresLancer = lancerDe(etat, tirage);
        // Le trait a changé : trois six d'affilée, le tour est annulé.
        if (apresLancer.trait === avant && coupsLudo(apresLancer).length === 0) {
          apresLancer = passerLaMain(apresLancer);
        }
        etat = apresLancer;
        if (!survitAuTrajet(etat, parseEtatLudo)) {
          echecs.push(`Ludo, partie ${partie}, tour ${tour}, après le lancer`);
          break;
        }
        if (etat.de !== null) {
          const legaux = coupsLudo(etat);
          const choisi = legaux[Math.floor(tirage() * legaux.length)];
          if (choisi === undefined) break;
          etat = appliquerLudo(etat, choisi);
          if (!survitAuTrajet(etat, parseEtatLudo)) {
            echecs.push(`Ludo, partie ${partie}, tour ${tour}, après le coup`);
            break;
          }
        }
      }
    }
    expect(echecs).toEqual([]);
  });

  it('accepte n’importe quel mot du dictionnaire comme mot à deviner', () => {
    // 6 806 mots embarqués : si le schéma en refusait ne serait-ce qu'un,
    // la partie qui tomberait dessus repartirait de zéro au rechargement.
    const mots = motsJson as readonly string[];
    const refuses = mots.filter(
      (mot) =>
        parseEtatMot({
          manches: [{ proposeur: 'un', devineur: 'deux', mot, tentatives: [] }],
        }) === null,
    );
    expect(refuses).toEqual([]);
  });

  it('tient d’un bout à l’autre d’une partie du Mot', () => {
    const mots = motsJson as readonly string[];
    const secret = mots[3];
    const second = mots[9];
    expect(secret).toBeDefined();
    expect(second).toBeDefined();
    if (secret === undefined || second === undefined) return;

    let etat = choisirMot(departMot(), secret);
    expect(survitAuTrajet(etat, parseEtatMot)).toBe(true);

    const premiere = etat.manches[0];
    expect(premiere).toBeDefined();
    for (let essai = 0; essai < 6; essai += 1) {
      const manche = etat.manches[0];
      if (manche === undefined || mancheTerminee(manche)) break;
      const tentative = mots[(essai * 137) % mots.length];
      if (tentative === undefined) break;
      etat = tenterMot(etat, tentative);
      expect(survitAuTrajet(etat, parseEtatMot)).toBe(true);
    }

    etat = passerManche(etat);
    expect(survitAuTrajet(etat, parseEtatMot)).toBe(true);
    etat = tenterMot(choisirMot(etat, second), second);
    expect(survitAuTrajet(etat, parseEtatMot)).toBe(true);
  });

  it('tient d’un bout à l’autre d’une grille de mots croisés, sur les huit', () => {
    for (const grille of GRILLES) {
      let etat = departMotsCroises(grille.id);
      expect(survitAuTrajet(etat, parseEtatMotsCroises)).toBe(true);
      for (const emplacement of tousLesEmplacements()) {
        if (partieTerminee(etat)) break;
        const resultat = tenterMotsCroises(
          etat,
          emplacement,
          motAttendu(trouverGrille(etat.idGrille), emplacement),
        );
        expect(resultat.correct).toBe(true);
        etat = resultat.etat;
        expect(survitAuTrajet(etat, parseEtatMotsCroises)).toBe(true);
      }
      expect(issueMotsCroises(etat).fini).toBe(true);
    }
  });

  it('refuse l’état d’un autre jeu — la garde de forme garde vraiment quelque chose', () => {
    // Les quatre routes du Salon sont indifférentes au jeu : c'est `kind` qui
    // choisit le schéma. Si celui des dames acceptait un plateau d'Awalé, une
    // erreur de `kind` passerait sans bruit et écrirait un état incohérent.
    const etrangers: Record<string, unknown> = {
      AWALE: departAwale(),
      LUDO: departLudo(),
      MOT: departMot(),
      MOTS_CROISES: departMotsCroises(GRILLES[0]?.id ?? ''),
    };
    const acceptes = Object.entries(etrangers)
      .filter(([, etat]) => survitAuTrajet(etat, parseEtatPlateau))
      .map(([jeu]) => jeu);
    expect(acceptes).toEqual([]);
  });
});
