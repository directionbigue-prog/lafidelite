import { describe, it, expect } from 'vitest';
import {
  PACKS,
  PACKS_PAYANTS,
  THEME_DECOUVERTE,
  packParId,
  packDecouverte,
  packEffectif,
  finDuDroit,
  themeOuvert,
  ouvreToutLeCatalogue,
  verifierThemes,
  palierDuTheme,
  type DroitAcces,
} from './packs';
import { NOMS_THEMES } from './themes';

const T = (id: string, expiresAt: Date): DroitAcces => ({ packId: id, expiresAt });
const DANS_UN_MOIS = new Date('2026-10-19T00:00:00Z');
const MAINTENANT = new Date('2026-09-19T00:00:00Z');
const HIER = new Date('2026-09-18T00:00:00Z');

describe('le registre des paliers', () => {
  it('tient les prix donnés, en plus petite unité XOF', () => {
    expect(packParId('ESSENTIEL')?.prix).toBe(4900);
    expect(packParId('INTEGRAL')?.prix).toBe(9900);
    expect(packParId('ANNUEL')?.prix).toBe(118800);
    expect(packParId('DECOUVERTE')?.prix).toBe(0);
  });

  it('vend trois durees : deux jours, sept jours, trente jours', () => {
    expect(packParId('WEEKEND')?.dureeJours).toBe(2);
    expect(packParId('ESSENTIEL')?.dureeJours).toBe(7);
    expect(packParId('INTEGRAL')?.dureeJours).toBe(30);
  });

  it('garde l’annuel resoluble bien qu’il ne soit plus en vente', () => {
    // Des droits annuels payes courent encore : packParId doit continuer de
    // les resoudre, sinon packEffectif ferait retomber un client sur
    // Decouverte.
    const annuel = packParId('ANNUEL');
    expect(annuel).not.toBeNull();
    expect(annuel?.enVente).toBe(false);
    expect(annuel?.dureeJours).toBe(365);
  });

  it('n’a aucune décimale : XOF n’en a pas', () => {
    for (const pack of PACKS) expect(Number.isInteger(pack.prix)).toBe(true);
  });

  it('met trois paliers en vente, jamais le gratuit', () => {
    expect(PACKS_PAYANTS.map((p) => p.id)).toEqual(['WEEKEND', 'ESSENTIEL', 'INTEGRAL']);
  });

  it('ouvre un seul thème au palier gratuit, pour essayer', () => {
    expect(packDecouverte().themes).toEqual([THEME_DECOUVERTE]);
    expect(THEME_DECOUVERTE).toBe('Confiance & Jalousie');
  });

  // Depuis le 02/10/2026 les paliers payants ne se distinguent plus par le
  // contenu mais par la DUREE. Les deux tests precedents asserted l'echelle
  // inverse (six themes a l'Essentiel, huit a l'Integral) ; ils sont remplaces
  // et non supprimes, pour que la regle reste sous test.
  it('ouvre TOUT le catalogue a chaque palier payant', () => {
    for (const pack of PACKS_PAYANTS) {
      expect(pack.themes, pack.id).toEqual(NOMS_THEMES);
    }
  });

  it('inclut « Projets & Engagement » et « Mode Piment » partout ou l’on paie', () => {
    for (const pack of PACKS_PAYANTS) {
      expect(pack.themes, pack.id).toContain('Projets & Engagement');
      expect(pack.themes, pack.id).toContain('Mode Piment · 18+');
    }
  });

  it('laisse le palier gratuit sur un seul theme — sinon il n’y a rien a vendre', () => {
    expect(packDecouverte().themes).toEqual([THEME_DECOUVERTE]);
  });

  it('offre le Salon à tous les palier payants, et à eux seuls', () => {
    expect(packDecouverte().salon).toBe(false);
    for (const pack of PACKS_PAYANTS) expect(pack.salon).toBe(true);
  });
});

describe('packEffectif', () => {
  it('retombe sur Découverte sans aucun droit', () => {
    expect(packEffectif([], MAINTENANT).id).toBe('DECOUVERTE');
  });

  it('retient un droit encore valide', () => {
    expect(packEffectif([T('INTEGRAL', DANS_UN_MOIS)], MAINTENANT).id).toBe('INTEGRAL');
  });

  it('ignore un droit expiré', () => {
    expect(packEffectif([T('INTEGRAL', HIER)], MAINTENANT).id).toBe('DECOUVERTE');
  });

  it('traite une expiration à la seconde exacte comme expirée', () => {
    expect(packEffectif([T('INTEGRAL', MAINTENANT)], MAINTENANT).id).toBe('DECOUVERTE');
  });

  it('retient le plus généreux quand deux droits se chevauchent', () => {
    const droits = [T('ESSENTIEL', DANS_UN_MOIS), T('INTEGRAL', DANS_UN_MOIS)];
    expect(packEffectif(droits, MAINTENANT).id).toBe('INTEGRAL');
    expect(packEffectif([...droits].reverse(), MAINTENANT).id).toBe('INTEGRAL');
  });

  it('ne laisse pas un droit expiré écraser un droit valide plus faible', () => {
    const droits = [T('INTEGRAL', HIER), T('ESSENTIEL', DANS_UN_MOIS)];
    expect(packEffectif(droits, MAINTENANT).id).toBe('ESSENTIEL');
  });

  it('ignore un palier retiré du registre plutôt que d’échouer', () => {
    const droits = [T('PALIER_SUPPRIME', DANS_UN_MOIS), T('ESSENTIEL', DANS_UN_MOIS)];
    expect(packEffectif(droits, MAINTENANT).id).toBe('ESSENTIEL');
  });
});

describe('finDuDroit', () => {
  it('ajoute sept jours a la Semaine', () => {
    const pack = packParId('ESSENTIEL');
    expect(pack && finDuDroit(pack, new Date('2026-09-19T10:00:00Z')).toISOString()).toBe(
      new Date('2026-09-26T10:00:00Z').toISOString(),
    );
  });

  it('ajoute exactement 48 heures au Week-end', () => {
    const pack = packParId('WEEKEND');
    expect(pack && finDuDroit(pack, new Date('2026-09-19T10:00:00Z')).toISOString()).toBe(
      new Date('2026-09-21T10:00:00Z').toISOString(),
    );
  });

  // Le piege que l'arithmetique en millisecondes supprime : setMonth sur un
  // 31 janvier normalisait en silence vers le 3 mars, donc un droit « d'un
  // mois » valait 31 jours pour les uns et 28 pour les autres.
  it('donne la meme duree quel que soit le quantieme de depart', () => {
    const pack = packParId('INTEGRAL');
    if (!pack) throw new Error('INTEGRAL absent du registre');
    for (const depart of ['2026-01-31T10:00:00Z', '2026-02-01T10:00:00Z', '2026-06-15T10:00:00Z']) {
      const debut = new Date(depart);
      const ecoule = finDuDroit(pack, debut).getTime() - debut.getTime();
      expect(ecoule / (24 * 60 * 60 * 1000), depart).toBe(30);
    }
  });

  it('ajoute douze mois à l’annuel', () => {
    const pack = packParId('ANNUEL');
    expect(pack && finDuDroit(pack, new Date('2026-09-19T10:00:00Z')).getFullYear()).toBe(2027);
  });

  it('ne modifie pas la date qu’on lui passe', () => {
    const debut = new Date('2026-09-19T10:00:00Z');
    const pack = packParId('ANNUEL');
    if (pack) finDuDroit(pack, debut);
    expect(debut.toISOString()).toBe('2026-09-19T10:00:00.000Z');
  });
});

describe('verifierThemes', () => {
  const decouverte = packDecouverte();
  const essentiel = packParId('ESSENTIEL');
  const integral = packParId('INTEGRAL');

  it('refuse un thème fermé au lieu de le retirer en silence', () => {
    const verdict = verifierThemes(decouverte, ['Ex et passé']);
    expect(verdict.refuses).toEqual(['Ex et passé']);
    expect(verdict.categories).toBeUndefined();
  });

  it('nomme TOUS les thèmes refusés, pas seulement le premier', () => {
    const verdict = verifierThemes(decouverte, ['Ex et passé', 'Mode Piment · 18+']);
    expect(verdict.refuses).toEqual(['Ex et passé', 'Mode Piment · 18+']);
  });

  it('ne refuse plus aucun theme a un palier payant', () => {
    for (const pack of PACKS_PAYANTS) {
      for (const nom of NOMS_THEMES) {
        expect(verifierThemes(pack, [nom]).refuses, pack.id + ' / ' + nom).toEqual([]);
      }
    }
  });

  it('laisse passer une demande entièrement ouverte', () => {
    const verdict =
      essentiel && verifierThemes(essentiel, ['Ex et passé', 'Argent & Transparence']);
    expect(verdict?.refuses).toEqual([]);
    expect(verdict?.categories).toEqual(['Ex et passé', 'Argent & Transparence']);
  });

  // Le cas qui rend le palier gratuit réel plutôt que décoratif.
  it('restreint un palier partiel même quand rien n’est demandé', () => {
    // Decouverte reste le seul palier partiel : c'est lui qui rend le test
    // non decoratif. Les paliers payants sont desormais complets, et un
    // palier complet ne restreint rien — assertion juste en dessous.
    expect(verifierThemes(decouverte, []).categories).toEqual([THEME_DECOUVERTE]);
  });

  it('ne restreint aucun palier payant quand rien n’est demandé', () => {
    for (const pack of PACKS_PAYANTS) {
      expect(verifierThemes(pack, []).categories, pack.id).toBeUndefined();
    }
  });

  it('ne restreint pas un palier complet quand rien n’est demandé', () => {
    const verdict = integral && verifierThemes(integral, []);
    expect(verdict?.categories).toBeUndefined();
    expect(verdict?.refuses).toEqual([]);
  });

  it('n’altère pas la liste des thèmes du registre', () => {
    const avant = [...decouverte.themes];
    const verdict = verifierThemes(decouverte, []);
    verdict.categories?.push('intrus');
    expect(decouverte.themes).toEqual(avant);
  });
});

describe('themeOuvert et ouvreToutLeCatalogue', () => {
  it('sait ce que le palier gratuit ouvre', () => {
    expect(themeOuvert(packDecouverte(), THEME_DECOUVERTE)).toBe(true);
    expect(themeOuvert(packDecouverte(), 'Ex et passé')).toBe(false);
  });

  it('ne déclare complet que ce qui l’est', () => {
    expect(ouvreToutLeCatalogue(packDecouverte())).toBe(false);
    for (const pack of PACKS_PAYANTS) {
      expect(ouvreToutLeCatalogue(pack), pack.id).toBe(true);
    }
  });
});

describe('palierDuTheme', () => {
  it('donne le palier le moins cher qui ouvre un thème', () => {
    // Le gratuit garde son unique theme ; tous les autres sont desormais
    // ouverts par le palier payant le MOINS cher, donc le Week-end a 2 000.
    expect(palierDuTheme('Confiance & Jalousie')?.id).toBe('DECOUVERTE');
    expect(palierDuTheme('Ex et passé')?.id).toBe('WEEKEND');
    expect(palierDuTheme('Mode Piment · 18+')?.id).toBe('WEEKEND');
    expect(palierDuTheme('Projets & Engagement')?.id).toBe('WEEKEND');
  });

  it('couvre les huit thèmes — aucun n’est invendable', () => {
    for (const nom of NOMS_THEMES) expect(palierDuTheme(nom)).not.toBeNull();
  });

  it('rend null sur un thème inconnu', () => {
    expect(palierDuTheme('Inventé')).toBeNull();
  });
});
