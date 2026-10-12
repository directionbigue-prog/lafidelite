import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  MESSAGE_RENVOI,
  PISTES_SI_RIEN_NE_VIENT,
  TOURNURES_INTERDITES,
} from './verification-renvoi';

const here = dirname(fileURLToPath(import.meta.url));
const FORMULAIRE = resolve(here, '../../app/verify-email/VerifyEmailForm.tsx');

const tout = [MESSAGE_RENVOI, ...PISTES_SI_RIEN_NE_VIENT].join('\n').toLowerCase();

describe('le texte du renvoi ne révèle pas l’existence d’un compte', () => {
  // L'assertion qui compte. `POST /api/auth/resend-verification` refuse
  // délibérément de distinguer « inconnue », « déjà vérifiée » et « en
  // attente » ; une phrase d'interface qui ferait la distinction annulerait
  // cette protection sans toucher une ligne de serveur.
  it('n’emploie aucune tournure affirmant l’état de l’adresse saisie', () => {
    for (const interdite of TOURNURES_INTERDITES) {
      expect(tout, interdite).not.toContain(interdite.toLowerCase());
    }
  });

  it('garde la confirmation au conditionnel', () => {
    expect(MESSAGE_RENVOI.toLowerCase()).toContain('si une vérification est en attente');
  });

  // Le piège de la rédaction « utile » : parler du compte du lecteur plutôt
  // que de la règle générale. « Votre compte est déjà vérifié » renseigne ;
  // « un compte déjà vérifié ne reçoit rien » n'apprend rien sur personne.
  it('énonce une règle générale, jamais un fait sur le lecteur', () => {
    const piste = PISTES_SI_RIEN_NE_VIENT.find((p) => p.includes('déjà vérifié'));
    expect(piste, 'la piste « déjà vérifié » doit exister').toBeDefined();
    expect(piste!.toLowerCase()).toContain('un compte déjà vérifié');
    expect(piste!.toLowerCase()).not.toContain('votre compte');
    expect(piste!.toLowerCase()).not.toContain('cette adresse est');
  });
});

describe('le texte couvre les trois silences possibles', () => {
  it('cite les indésirables — la cause la plus fréquente', () => {
    expect(tout).toContain('indésirables');
  });

  // La cause qui a réellement bloqué quelqu'un le 02/10/2026 : le compte
  // était vérifié depuis 11:28:58, donc aucun renvoi n'était possible.
  it('dit qu’un compte déjà vérifié ne reçoit rien, et où aller', () => {
    expect(tout).toContain('déjà vérifié');
    expect(tout).toContain('connexion');
  });

  it('rappelle que le code expire', () => {
    expect(tout).toMatch(/quelques minutes|expire/);
  });

  it('propose trois pistes, pas une liste qui décourage', () => {
    expect(PISTES_SI_RIEN_NE_VIENT).toHaveLength(3);
    for (const p of PISTES_SI_RIEN_NE_VIENT) expect(p.length).toBeLessThan(220);
  });
});

describe('l’écran consomme bien ce module', () => {
  // Sans jsdom, on ne peut pas monter le composant. On vérifie donc au niveau
  // de la source qu'il IMPORTE ces constantes — sinon le texte pourrait être
  // recopié en dur dans le JSX et diverger du module que ces tests gardent.
  it('VerifyEmailForm importe MESSAGE_RENVOI et les pistes', () => {
    const src = readFileSync(FORMULAIRE, 'utf8');
    expect(src).toContain('verification-renvoi');
    expect(src).toContain('MESSAGE_RENVOI');
    expect(src).toContain('PISTES_SI_RIEN_NE_VIENT');
  });

  it('ne garde pas une copie en dur de l’ancienne phrase', () => {
    const src = readFileSync(FORMULAIRE, 'utf8');
    const sansImport = src
      .split('\n')
      .filter((l) => !l.includes('import'))
      .join('\n');
    expect(sansImport).not.toContain('Si une vérification est en attente pour cette adresse');
  });
});
