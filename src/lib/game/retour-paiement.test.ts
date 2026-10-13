import { describe, it, expect } from 'vitest';
import { etatDuRetour, doitRelire, TENTATIVES_MAX } from './retour-paiement';

const droit = { packId: 'INTEGRAL', status: 'ACTIVE', expiresAt: '2026-11-12T00:00:00.000Z' };

describe('etatDuRetour', () => {
  it('annonce le pack ouvert seulement quand le droit existe', () => {
    expect(etatDuRetour({ status: 'PAID', droit }, 0)).toEqual({
      kind: 'ouvert',
      packId: 'INTEGRAL',
      expiresAt: droit.expiresAt,
    });
    expect(etatDuRetour({ status: 'PAID', droit: null }, 0).kind).toBe('paye-sans-droit');
    expect(etatDuRetour({ status: 'PAID', droit: { ...droit, status: 'REFUNDED' } }, 0).kind).toBe(
      'paye-sans-droit',
    );
  });

  it('attend une commande en cours, puis cesse au-delà de la limite', () => {
    expect(etatDuRetour({ status: 'PENDING', droit: null }, 3).kind).toBe('attente');
    expect(etatDuRetour({ status: 'PENDING', droit: null }, TENTATIVES_MAX).kind).toBe('trop-long');
  });

  it('traite tout autre statut comme un échec', () => {
    for (const s of ['FAILED', 'EXPIRED', 'REFUNDED']) {
      expect(etatDuRetour({ status: s, droit: null }, 0).kind).toBe('echec');
    }
  });

  it('ne relit que pendant l’attente', () => {
    expect(doitRelire({ kind: 'attente' })).toBe(true);
    expect(doitRelire({ kind: 'echec' })).toBe(false);
    expect(doitRelire({ kind: 'trop-long' })).toBe(false);
  });
});
