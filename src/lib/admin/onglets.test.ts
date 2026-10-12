import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  ONGLETS,
  ongletsVisibles,
  estOnglet,
  montantLisible,
  tonDuStatut,
  libelleStatut,
  construireRequete,
  formaterInstant,
  identifiantCourt,
} from './console';

// Douze routes d'administration existaient depuis la phase 5 ; deux seulement
// avaient un écran. Commandes, retraits, journal d'audit, outbox, file
// d'e-mails et limiteurs répondaient correctement et n'étaient atteignables de
// nulle part. Ces tests gardent la logique des surfaces ajoutées le 03/10.

const here = dirname(fileURLToPath(import.meta.url));
const PAGE = resolve(here, '../../app/admin/page.tsx');
const page = readFileSync(PAGE, 'utf8');

// Les deux listes de capacités que `/api/admin/me` renvoie, recopiées depuis
// son contrat verrouillé (me/route.test.ts exige exactement 8 et 11).
const CAN_ADMIN = [
  'users:read',
  'users:status:suspend',
  'orders:read',
  'withdrawals:read',
  'audit-log:read',
  'outbox:read',
  'email-queue:read',
  'rate-limits:read',
];
const CAN_SUPERADMIN = [
  'users:read',
  'users:role',
  'users:status:suspend',
  'users:status:restore',
  'orders:read',
  'withdrawals:read',
  'withdrawals:cancel',
  'audit-log:read',
  'outbox:read',
  'email-queue:read',
  'rate-limits:read',
];

describe('les onglets suivent les capacités annoncées par le serveur', () => {
  it('un ADMIN voit les six surfaces', () => {
    expect(ongletsVisibles(CAN_ADMIN).map((o) => o.id)).toEqual([
      'comptes',
      'connexions',
      'commandes',
      'retraits',
      'journal',
      'systeme',
    ]);
  });

  it('un SUPERADMIN voit au moins autant', () => {
    expect(ongletsVisibles(CAN_SUPERADMIN).length).toBeGreaterThanOrEqual(
      ongletsVisibles(CAN_ADMIN).length,
    );
  });

  // Le cas qui compte : une liste vide ou absente ne doit pas tout ouvrir.
  it('sans capacité, seul ce qui n’en exige aucune reste', () => {
    for (const can of [[], undefined]) {
      const vus = ongletsVisibles(can).map((o) => o.id);
      expect(vus, String(can)).toEqual(['connexions']);
    }
  });

  it('retire précisément l’onglet dont la capacité manque', () => {
    const sansRetraits = CAN_ADMIN.filter((c) => c !== 'withdrawals:read');
    expect(ongletsVisibles(sansRetraits).map((o) => o.id)).not.toContain('retraits');
    expect(ongletsVisibles(sansRetraits).map((o) => o.id)).toContain('commandes');
  });

  // La liste de capacités est CONTRACTUELLE : me/route.test.ts exige
  // exactement 8 pour ADMIN et 11 pour SUPERADMIN, et CLAUDE.md le déclare
  // verrouillé. Un onglet qui inventerait une capacité serait invisible pour
  // tout le monde, sans que rien n'échoue.
  it('n’invente aucune capacité hors du contrat', () => {
    const connues = new Set(CAN_SUPERADMIN);
    for (const o of ONGLETS) {
      if (o.capacite === null) continue;
      expect(connues, `${o.id} exige « ${o.capacite} », absente du contrat`).toContain(o.capacite);
    }
  });

  it('reconnaît ses propres identifiants, et rien d’autre', () => {
    for (const o of ONGLETS) expect(estOnglet(o.id), o.id).toBe(true);
    for (const v of ['', null, undefined, 'Comptes', 'inconnu']) {
      expect(estOnglet(v), String(v)).toBe(false);
    }
  });
});

describe('les montants', () => {
  // CLAUDE.md : « Payment amounts are integer in smallest currency unit
  // (FCFA = no decimals) ». Diviser par 100 « pour faire joli » afficherait un
  // centième du vrai prix sur un écran financier.
  it('ne divise jamais par cent', () => {
    expect(montantLisible(9900, 'XOF')).toContain('9');
    expect(montantLisible(9900, 'XOF')).not.toContain('99,00');
    expect(montantLisible(9900, 'XOF')).not.toContain('99.00');
  });

  it('groupe les milliers et dit FCFA plutôt que le code ISO', () => {
    expect(montantLisible(9900, 'XOF')).toBe('9 900 FCFA');
    expect(montantLisible(2000, 'XOF')).toBe('2 000 FCFA');
    expect(montantLisible(118800, 'XOF')).toBe('118 800 FCFA');
  });

  it('garde une devise étrangère telle quelle', () => {
    expect(montantLisible(500, 'USD')).toBe('500 USD');
  });

  it('survit à une devise absente et à zéro', () => {
    expect(montantLisible(0, null)).toBe('0 FCFA');
    expect(montantLisible(750)).toBe('750 FCFA');
  });
});

describe('les statuts', () => {
  it('traduit ceux des commandes et des retraits', () => {
    expect(libelleStatut('PAID')).toBe('Payée');
    expect(libelleStatut('CANCELLED')).toBe('Annulé');
    expect(libelleStatut('DEAD')).toBe('Abandonné');
  });

  it('distingue réussite, attente et échec', () => {
    expect(tonDuStatut('PAID')).toBe('succes');
    expect(tonDuStatut('COMPLETED')).toBe('succes');
    expect(tonDuStatut('PENDING')).toBe('attente');
    expect(tonDuStatut('FAILED')).toBe('echec');
    expect(tonDuStatut('DEAD')).toBe('echec');
  });

  it('ne se tait pas devant un statut inconnu', () => {
    // Afficher le code brut vaut mieux qu'une cellule vide : on peut le
    // chercher dans le code, alors qu'un vide ne dit rien.
    expect(libelleStatut('TOUT_NOUVEAU')).toBe('TOUT_NOUVEAU');
    expect(tonDuStatut('TOUT_NOUVEAU')).toBe('neutre');
    expect(libelleStatut(null)).toBe('—');
  });
});

describe('la chaîne de requête', () => {
  it('n’envoie que ce qui est renseigné', () => {
    expect(construireRequete('/admin/orders', { status: '', cursor: null })).toBe('/admin/orders');
    expect(construireRequete('/admin/orders', { status: 'PAID' })).toBe(
      '/admin/orders?status=PAID',
    );
  });

  // Un `?status=` serait lu comme un filtre sur la chaîne vide par certaines
  // routes, et ne renverrait rien — un tableau vide sans explication.
  it('ne laisse jamais un paramètre vide dans l’URL', () => {
    const url = construireRequete('/admin/orders', {
      status: '   ',
      cursor: undefined,
      limit: 25,
    });
    expect(url).not.toContain('status=');
    expect(url).toContain('limit=25');
  });

  it('encode ce qui doit l’être', () => {
    expect(construireRequete('/admin/audit-log', { actor: 'a b&c' })).toContain('actor=a+b%26c');
  });
});

describe('l’affichage du journal', () => {
  it('donne l’heure, pas seulement la date', () => {
    // Un journal d'audit sans heure ne permet pas de reconstituer un incident.
    const rendu = formaterInstant('2026-10-03T14:07:00');
    expect(rendu).toMatch(/03\/10\/2026/);
    expect(rendu).toMatch(/\d{2}:\d{2}/);
  });

  it('ne rend pas « Invalid Date »', () => {
    for (const v of [null, undefined, '', 'pas-une-date']) {
      expect(formaterInstant(v), String(v)).toBe('—');
    }
  });

  it('raccourcit un identifiant par la FIN, pas par le début', () => {
    // Les cuid partagent leur préfixe : garder les premiers caractères
    // afficherait la même chaîne sur toutes les lignes.
    const a = 'cmg1abcdefghij0001';
    const b = 'cmg1abcdefghij0002';
    expect(identifiantCourt(a)).not.toBe(identifiantCourt(b));
    expect(identifiantCourt(a)).toBe('…ghij0001');
    expect(identifiantCourt('court')).toBe('court');
    expect(identifiantCourt(null)).toBe('—');
  });
});

describe('la page consomme bien ces surfaces', () => {
  it('rend chaque onglet déclaré', () => {
    for (const o of ONGLETS) {
      expect(page, `l'onglet ${o.id} n'est rendu nulle part`).toContain(`onglet === '${o.id}'`);
    }
  });

  it('décide des onglets avec ongletsVisibles, pas à la main', () => {
    expect(page).toContain('ongletsVisibles');
  });

  it('ne montre l’annulation d’un retrait qu’avec la capacité correspondante', () => {
    // Le serveur revérifie (requireSuperadmin), donc ceci n'est pas une
    // protection — c'est éviter d'offrir un bouton qui reviendrait en 403.
    expect(page).toContain('withdrawals:cancel');
  });
});
