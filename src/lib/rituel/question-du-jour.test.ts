import { describe, expect, it } from 'vitest';
import { choixValide, optionsPubliques, revelation } from './question-du-jour';
import {
  etapeQuestion,
  nomDe,
  rappelsActifs,
  dateCourte,
  legendeSerie,
  compteARebours,
  msAvantProchaineQuestion,
  prochainObjectif,
  phraseObjectif,
} from './ecran';
import {
  cleATonTour,
  cleFlamme,
  cleRappel,
  doitRelancer,
  flammeAAlerter,
  mailATonTour,
  mailFlamme,
  mailRappel,
} from './rappel';
import { etatDesBadges } from './badges';

describe('optionsPubliques', () => {
  it('reconstruit chaque option avec id et text seulement', () => {
    const brut = [{ id: 'a', text: 'Oui', weight: 3, secret: 'x' }, { id: 'b' }, 'bruit'];
    expect(optionsPubliques(brut)).toEqual([{ id: 'a', text: 'Oui' }]);
  });

  it('rend une liste vide sur une forme inattendue', () => {
    expect(optionsPubliques(null)).toEqual([]);
  });
});

describe('choixValide', () => {
  const options = [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
  ];
  it('accepte un id de la question et rien d’autre', () => {
    expect(choixValide(options, 'a')).toBe(true);
    expect(choixValide(options, 'z')).toBe(false);
    expect(choixValide(options, 1)).toBe(false);
  });
});

describe('revelation', () => {
  it('ne dévoile RIEN tant qu’un seul a répondu', () => {
    const r = revelation([{ role: 'CREATOR', choixPropre: 'a', choixDevine: 'b' }]);
    expect(r).toEqual({ aRepondu: { CREATOR: true, PARTNER: false }, revele: null });
    // Le choix du premier ne doit apparaître nulle part dans la sortie.
    expect(JSON.stringify(r)).not.toContain('"a"');
  });

  it('dévoile les deux et juge chaque devinette contre la réponse de l’AUTRE', () => {
    const r = revelation([
      { role: 'CREATOR', choixPropre: 'a', choixDevine: 'c' },
      { role: 'PARTNER', choixPropre: 'c', choixDevine: 'b' },
    ]);
    expect(r.revele?.CREATOR.devineJuste).toBe(true);
    expect(r.revele?.PARTNER.devineJuste).toBe(false);
    expect(r.revele?.telepathie).toBe(false);
  });

  it('télépathie quand chacun a deviné l’autre', () => {
    const r = revelation([
      { role: 'CREATOR', choixPropre: 'a', choixDevine: 'b' },
      { role: 'PARTNER', choixPropre: 'b', choixDevine: 'a' },
    ]);
    expect(r.revele?.telepathie).toBe(true);
  });

  it('ignore une ligne au rôle inconnu', () => {
    const r = revelation([{ role: 'INTRUS', choixPropre: 'a', choixDevine: 'b' }]);
    expect(r.aRepondu).toEqual({ CREATOR: false, PARTNER: false });
  });
});

describe('etapeQuestion', () => {
  const personne = { aRepondu: { CREATOR: false, PARTNER: false }, revele: null };
  const unSeul = { aRepondu: { CREATOR: true, PARTNER: false }, revele: null };

  it('demande qui tient le téléphone tant que personne n’est désigné', () => {
    expect(etapeQuestion(personne, null)).toEqual({
      kind: 'choisir-qui',
      restants: ['CREATOR', 'PARTNER'],
    });
  });

  it('ne repropose pas un partenaire qui a déjà répondu', () => {
    expect(etapeQuestion(unSeul, null)).toEqual({ kind: 'choisir-qui', restants: ['PARTNER'] });
  });

  it('un partenaire déjà répondu passe à l’attente de l’autre', () => {
    expect(etapeQuestion(unSeul, 'CREATOR')).toEqual({ kind: 'attente', manquant: 'PARTNER' });
  });

  it('ouvre le formulaire pour un partenaire qui n’a pas répondu', () => {
    expect(etapeQuestion(unSeul, 'PARTNER')).toEqual({ kind: 'repondre', role: 'PARTNER' });
  });
});

describe('écran', () => {
  it('nomDe ne laisse jamais une phrase vide', () => {
    expect(nomDe({ CREATOR: '  ', PARTNER: 'Awa' }, 'CREATOR')).toBe('Partenaire 1');
    expect(nomDe({ CREATOR: null, PARTNER: 'Awa' }, 'PARTNER')).toBe('Awa');
  });

  it('les rappels sont actifs tant qu’on ne les a pas coupés', () => {
    expect(rappelsActifs({}, 'RAPPEL_COUPLE')).toBe(true);
    expect(rappelsActifs(null, 'RAPPEL_COUPLE')).toBe(true);
    expect(rappelsActifs({ RAPPEL_COUPLE: { inApp: false } }, 'RAPPEL_COUPLE')).toBe(true);
    expect(rappelsActifs({ RAPPEL_COUPLE: { email: false } }, 'RAPPEL_COUPLE')).toBe(false);
  });

  it('dateCourte écrit le mois en français', () => {
    expect(dateCourte('2026-10-03')).toBe('3 oct. 2026');
    expect(dateCourte('n’importe quoi')).toBe('n’importe quoi');
  });

  it('la légende de série alerte quand la flamme vacille', () => {
    expect(legendeSerie({ actuelle: 4, record: 6, joueAujourdhui: false, enDanger: true })).toMatch(
      /vacille/,
    );
  });
});

describe('rappel', () => {
  it('relance entre deux et quatorze jours d’absence, pas avant, pas après', () => {
    expect(doitRelancer('2026-10-12', '2026-10-13')).toBe(false);
    expect(doitRelancer('2026-10-11', '2026-10-13')).toBe(true);
    expect(doitRelancer('2026-09-29', '2026-10-13')).toBe(true);
    expect(doitRelancer('2026-09-28', '2026-10-13')).toBe(false);
  });

  it('une même absence rend toujours la même clé, une nouvelle absence une autre', () => {
    expect(cleRappel('u1', '2026-10-11')).toBe(cleRappel('u1', '2026-10-11'));
    expect(cleRappel('u1', '2026-10-11')).not.toBe(cleRappel('u1', '2026-10-12'));
  });

  it('échappe les prénoms dans la version HTML du mail', () => {
    const m = mailRappel({
      prenom: '<script>',
      partenaire: 'Awa',
      serieRecord: 5,
      origine: 'https://www.coeurfidele.net/',
    });
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('https://www.coeurfidele.net/rituel');
    expect(m.text).toContain('5 jours');
  });
});

describe('astuces', () => {
  it('compte à rebours jusqu’à minuit UTC', () => {
    const ms = msAvantProchaineQuestion(new Date('2026-10-13T18:48:00.000Z'));
    expect(compteARebours(ms)).toBe('5 h 12');
    expect(compteARebours(42 * 60_000)).toBe('42 min');
    expect(compteARebours(10_000)).toBe('moins d’une minute');
  });

  it('le prochain objectif de série se compte depuis la série EN COURS, pas le record', () => {
    const badges = etatDesBadges({
      forme: null,
      parties: [],
      quotidiennes: ['01', '02', '03', '04', '05', '06'].map((j) => ({
        jour: `2026-10-${j}`,
        telepathie: false,
      })),
    });
    // Record 6, mais série en cours 1 : « Une semaine à deux » est à 6 jours.
    const o = prochainObjectif(badges, { actuelle: 1 });
    expect(o).not.toBeNull();
    expect(phraseObjectif(o!)).not.toContain('Plus que 1 jour');
  });

  it('propose le badge le plus proche et accorde le pluriel', () => {
    const badges = etatDesBadges({ forme: null, parties: [], quotidiennes: [] });
    const o = prochainObjectif(badges, { actuelle: 2 });
    expect(o).toEqual({ titre: 'L’étincelle', reste: 1, unite: 'jour' });
    expect(phraseObjectif(o!)).toBe('Plus que 1 jour d’affilée pour le badge « L’étincelle ».');
  });

  it('n’alerte la flamme que si elle compte et s’éteint vraiment ce soir', () => {
    expect(flammeAAlerter({ actuelle: 5, joueAujourdhui: false, enDanger: true })).toBe(true);
    expect(flammeAAlerter({ actuelle: 1, joueAujourdhui: false, enDanger: true })).toBe(false);
    expect(flammeAAlerter({ actuelle: 5, joueAujourdhui: true, enDanger: false })).toBe(false);
    expect(flammeAAlerter({ actuelle: 5, joueAujourdhui: false, enDanger: false })).toBe(false);
  });

  it('une clé par partenaire et par jour pour « à ton tour » et la flamme', () => {
    expect(cleATonTour('u1', '2026-10-13')).toBe(cleATonTour('u1', '2026-10-13'));
    expect(cleATonTour('u1', '2026-10-13')).not.toBe(cleATonTour('u1', '2026-10-14'));
    expect(cleFlamme('u1', '2026-10-13')).not.toBe(cleATonTour('u1', '2026-10-13'));
  });

  it('« à ton tour » nomme l’auteur sans jamais dire ce qu’il a répondu', () => {
    const m = mailATonTour({ prenom: 'Moussa', auteur: 'Awa <b>', origine: 'https://x.test' });
    expect(m.subject).toContain('Awa');
    expect(m.html).not.toContain('<b>');
    expect(m.text).toContain('https://x.test/rituel');
  });

  it('la flamme annonce sa longueur', () => {
    const m = mailFlamme({ prenom: null, partenaire: 'Awa', jours: 6, origine: 'https://x.test' });
    expect(m.subject).toBe('Votre flamme de 6 jours vacille');
  });
});
