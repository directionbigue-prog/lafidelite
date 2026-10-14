import { describe, expect, it } from 'vitest';
import { doitJouer, type ConditionsAppareil } from './film';

// Les conditions les plus favorables possibles à une lecture automatique :
// si le film se tait ici, c'est qu'une règle non négociable l'a arrêté.
const FAVORABLES: ConditionsAppareil = {
  mouvementReduit: false,
  economieDonnees: false,
  reseau: '4g',
};
// Et les pires : rien ne doit partir tout seul ici, mais un choix explicite
// du visiteur doit quand même être obéi.
const DEFAVORABLES: ConditionsAppareil = {
  mouvementReduit: true,
  economieDonnees: true,
  reseau: 'slow-2g',
};

describe('doitJouer', () => {
  it('se tait hors de l’écran, même si le visiteur a demandé la lecture', () => {
    expect(doitJouer({ ...FAVORABLES, visible: false, choix: 'aucun' })).toBe(false);
    expect(doitJouer({ ...FAVORABLES, visible: false, choix: 'lecture' })).toBe(false);
  });

  it('obéit à une pause demandée, quelles que soient les conditions', () => {
    expect(doitJouer({ ...FAVORABLES, visible: true, choix: 'pause' })).toBe(false);
  });

  it('obéit à une lecture demandée, même en économie de données', () => {
    expect(doitJouer({ ...DEFAVORABLES, visible: true, choix: 'lecture' })).toBe(true);
  });

  it('ne part jamais tout seul quand le visiteur réduit les animations', () => {
    expect(doitJouer({ ...FAVORABLES, mouvementReduit: true, visible: true, choix: 'aucun' })).toBe(
      false,
    );
  });

  it('part tout seul en 4g, et quand le navigateur ne dit rien du réseau', () => {
    expect(doitJouer({ ...FAVORABLES, visible: true, choix: 'aucun' })).toBe(true);
    // Safari et Firefox : tous les iPhone tombent ici.
    expect(doitJouer({ ...FAVORABLES, reseau: undefined, visible: true, choix: 'aucun' })).toBe(
      true,
    );
  });

  it('ne part pas tout seul sur un réseau lent', () => {
    for (const reseau of ['3g', '2g', 'slow-2g']) {
      expect(doitJouer({ ...FAVORABLES, reseau, visible: true, choix: 'aucun' }), reseau).toBe(
        false,
      );
    }
  });

  it('ne part jamais tout seul en mode économie de données', () => {
    expect(doitJouer({ ...FAVORABLES, economieDonnees: true, visible: true, choix: 'aucun' })).toBe(
      false,
    );
  });
});
