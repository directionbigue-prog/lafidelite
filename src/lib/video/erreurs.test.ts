import { describe, it, expect } from 'vitest';
import { ApiError } from '@/lib/api';
import { codeErreurAppel, messageErreurAppel, MESSAGE_APPEL_PAR_DEFAUT } from './erreurs';

describe('messageErreurAppel', () => {
  it('nomme la vraie cause quand le compte Daily n’a pas de moyen de paiement', () => {
    // La forme exacte observée le 13/10/2026 dans un Chrome réel.
    const m = messageErreurAppel({ errorMsg: 'account-missing-payment-method' });
    expect(m).toContain('pas encore activé');
    expect(m).not.toBe(MESSAGE_APPEL_PAR_DEFAUT);
    expect(messageErreurAppel('account-missing-payment-method')).toBe(m);
    expect(messageErreurAppel({ error: { type: 'account-missing-payment-method' } })).toBe(m);
  });

  it('distingue permission refusée, appareil absent, appareil occupé', () => {
    expect(messageErreurAppel(new DOMException('x', 'NotAllowedError'))).toContain('Autorisez');
    expect(messageErreurAppel({ error: { type: 'not-found' } })).toContain('Aucune caméra');
    expect(messageErreurAppel({ error: { type: 'cam-in-use' } })).toContain('déjà utilisé');
  });

  it('salle pleine et jeton expiré', () => {
    expect(messageErreurAppel({ errorMsg: 'Meeting is full' })).toContain('deux appareils');
    expect(messageErreurAppel({ errorMsg: 'exp-token' })).toContain('expiré');
  });

  it('garde la traduction habituelle pour une erreur de notre API', () => {
    const e = new ApiError(404, 'NO_ACTIVE_COUPLE', { error: 'NO_ACTIVE_COUPLE' });
    expect(messageErreurAppel(e)).toBe("Vous n'avez pas encore d'Espace Couple.");
  });

  it('retombe sur un message neutre, jamais sur une chaîne vide', () => {
    expect(messageErreurAppel(undefined)).toBe(MESSAGE_APPEL_PAR_DEFAUT);
    expect(messageErreurAppel({ errorMsg: 'quelque-chose-d-inconnu' })).toBe(
      MESSAGE_APPEL_PAR_DEFAUT,
    );
    expect(codeErreurAppel(42)).toBe('');
  });
});
