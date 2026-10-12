import { describe, it, expect } from 'vitest';
import {
  TYPES_APPAREIL,
  typeAppareil,
  libelleAppareil,
  paysValide,
  drapeau,
  nomPays,
  GRANULARITES,
  estGranularite,
  debutDuSeau,
  seauSuivant,
  libelleDuSeau,
  construireSerie,
  debutDeFenetre,
  POINTS_PAR_GRANULARITE,
  classer,
} from './connexions';

// Les vrais « user-agent », copiés depuis des appareils existants. Des chaînes
// inventées rendraient ces tests décoratifs : la difficulté de la détection est
// entièrement dans ce que les constructeurs écrivent réellement.
const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  // Le piège : un iPad contient le mot « Mobile ».
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  androidTelephone:
    'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
  // Le piège inverse : une tablette Android dit « Android » SANS « Mobile »,
  // et contient « Linux », qui est aussi dans la signature d'un ordinateur.
  androidTablette:
    'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  robot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  vercelAperçu:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 HeadlessChrome/122.0.0.0 Safari/537.36',
};

describe('le type d’appareil', () => {
  it('reconnaît un téléphone', () => {
    expect(typeAppareil(UA.iphone)).toBe('TELEPHONE');
    expect(typeAppareil(UA.androidTelephone)).toBe('TELEPHONE');
  });

  // L'assertion qui compte : c'est le seul endroit où l'ordre des tests de la
  // fonction change le résultat. Chercher « Mobile » avant « iPad » classerait
  // toutes les tablettes Apple en téléphones.
  it('ne prend pas un iPad pour un téléphone, bien qu’il dise « Mobile »', () => {
    expect(UA.ipad).toContain('Mobile');
    expect(typeAppareil(UA.ipad)).toBe('TABLETTE');
  });

  // Et le piège symétrique côté Android.
  it('ne prend pas une tablette Android pour un ordinateur, bien qu’elle dise « Linux »', () => {
    expect(UA.androidTablette).toContain('Linux');
    expect(UA.androidTablette).not.toContain('Mobile');
    expect(typeAppareil(UA.androidTablette)).toBe('TABLETTE');
  });

  it('reconnaît un ordinateur', () => {
    expect(typeAppareil(UA.windows)).toBe('ORDINATEUR');
    expect(typeAppareil(UA.mac)).toBe('ORDINATEUR');
  });

  it('range les robots dans AUTRE, pour ne pas gonfler les visites', () => {
    expect(typeAppareil(UA.robot)).toBe('AUTRE');
    expect(typeAppareil(UA.vercelAperçu)).toBe('AUTRE');
  });

  it('ne devine rien sur une absence', () => {
    for (const v of [null, undefined, '', '   ']) {
      expect(typeAppareil(v), String(v)).toBe('AUTRE');
    }
  });

  it('ne rend jamais autre chose que les quatre classes déclarées', () => {
    for (const ua of Object.values(UA)) {
      expect(TYPES_APPAREIL, ua.slice(0, 30)).toContain(typeAppareil(ua));
    }
    expect(TYPES_APPAREIL).toHaveLength(4);
  });

  it('a un libellé lisible pour chaque classe', () => {
    for (const t of TYPES_APPAREIL) {
      expect(libelleAppareil(t), t).not.toBe(t);
      expect(libelleAppareil(t).length, t).toBeGreaterThan(2);
    }
  });
});

describe('le pays', () => {
  it('accepte un code à deux lettres et le met en majuscules', () => {
    expect(paysValide('sn')).toBe('SN');
    expect(paysValide('  FR  ')).toBe('FR');
  });

  // L'en-tête vient de l'infrastructure, mais un en-tête reste une entrée.
  it('refuse tout ce qui n’est pas deux lettres', () => {
    for (const v of [null, undefined, '', 'S', 'SEN', '12', 'S1', 'sénégal', '<script>']) {
      expect(paysValide(v), String(v)).toBeNull();
    }
  });

  it('traite XX et T1 comme une absence, pas comme un pays', () => {
    // Vercel renvoie XX quand il ne sait pas, T1 pour le réseau Tor. Les
    // afficher comme des pays mettrait un drapeau sur une inconnue.
    expect(paysValide('XX')).toBeNull();
    expect(paysValide('T1')).toBeNull();
  });

  it('rend le bon drapeau, construit depuis les indicateurs régionaux', () => {
    expect(drapeau('SN')).toBe('🇸🇳');
    expect(drapeau('FR')).toBe('🇫🇷');
    expect(drapeau('CI')).toBe('🇨🇮');
  });

  it('rend un drapeau neutre plutôt que rien sur un code invalide', () => {
    // Sinon la colonne de l'écran se désaligne sur les lignes sans pays.
    expect(drapeau(null)).toBe('🏳️');
    expect(drapeau('ZZZ')).toBe('🏳️');
  });

  it('nomme en français les pays que ce produit voit', () => {
    expect(nomPays('SN')).toBe('Sénégal');
    expect(nomPays('CI')).toBe("Côte d'Ivoire");
    expect(nomPays('FR')).toBe('France');
  });

  it('retombe sur le code plutôt que sur un vide pour un pays non listé', () => {
    expect(nomPays('JP')).toBe('JP');
    expect(nomPays(null)).toBe('Pays inconnu');
  });
});

describe('les seaux de temps', () => {
  it('accepte les cinq échelles et rien d’autre', () => {
    expect(GRANULARITES).toEqual(['heure', 'jour', 'semaine', 'mois', 'annee']);
    for (const g of GRANULARITES) expect(estGranularite(g), g).toBe(true);
    for (const v of ['minute', 'HEURE', '', null, undefined, 'année']) {
      expect(estGranularite(v as string), String(v)).toBe(false);
    }
  });

  it('tronque à l’heure, au jour, au mois et à l’année en UTC', () => {
    const d = new Date('2026-03-18T14:37:52.391Z');
    expect(debutDuSeau(d, 'heure').toISOString()).toBe('2026-03-18T14:00:00.000Z');
    expect(debutDuSeau(d, 'jour').toISOString()).toBe('2026-03-18T00:00:00.000Z');
    expect(debutDuSeau(d, 'mois').toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(debutDuSeau(d, 'annee').toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  // La semaine est le seul seau où l'arithmétique peut se tromper d'un cran.
  it('fait commencer la semaine le lundi, y compris depuis un dimanche', () => {
    // 2026-03-18 est un mercredi ; le lundi précédent est le 16.
    expect(debutDuSeau(new Date('2026-03-18T14:00:00Z'), 'semaine').toISOString()).toBe(
      '2026-03-16T00:00:00.000Z',
    );
    // Le dimanche 22 appartient à la semaine du lundi 16, pas à celle du 23 :
    // `getUTCDay()` rend 0 pour dimanche, donc il faut reculer de six jours.
    expect(debutDuSeau(new Date('2026-03-22T23:59:59Z'), 'semaine').toISOString()).toBe(
      '2026-03-16T00:00:00.000Z',
    );
    // Et le lundi est son propre début.
    expect(debutDuSeau(new Date('2026-03-16T00:00:00Z'), 'semaine').toISOString()).toBe(
      '2026-03-16T00:00:00.000Z',
    );
  });

  it('avance d’un seau sans jamais produire une date impossible', () => {
    // Le 31 janvier + un mois : `setMonth` normalisait en silence vers mars.
    // Ici le seau du mois part toujours du 1er, donc le pas est exact.
    expect(seauSuivant(new Date('2026-01-01T00:00:00Z'), 'mois').toISOString()).toBe(
      '2026-02-01T00:00:00.000Z',
    );
    expect(seauSuivant(new Date('2026-02-01T00:00:00Z'), 'mois').toISOString()).toBe(
      '2026-03-01T00:00:00.000Z',
    );
    expect(seauSuivant(new Date('2026-12-01T00:00:00Z'), 'mois').toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });

  it('étiquette chaque échelle lisiblement, sans dépendre d’ICU', () => {
    const d = new Date('2026-03-18T14:00:00Z');
    expect(libelleDuSeau(d, 'heure')).toBe('14h');
    expect(libelleDuSeau(d, 'jour')).toBe('18 mars');
    expect(libelleDuSeau(new Date('2026-03-16T00:00:00Z'), 'semaine')).toBe('sem. du 16 mars');
    expect(libelleDuSeau(new Date('2026-03-01T00:00:00Z'), 'mois')).toBe('mars 2026');
    expect(libelleDuSeau(new Date('2026-01-01T00:00:00Z'), 'annee')).toBe('2026');
  });
});

describe('la série remplit les silences', () => {
  const MAINTENANT = new Date('2026-03-18T14:37:00Z');

  it('rend exactement le nombre de points prévu pour l’échelle', () => {
    for (const g of GRANULARITES) {
      expect(construireSerie([], g, MAINTENANT), g).toHaveLength(POINTS_PAR_GRANULARITE[g]);
    }
  });

  // L'assertion centrale de ce module. Un `GROUP BY` ne renvoie que les
  // périodes actives : un graphique bâti dessus collerait deux jours chargés
  // côte à côte et effacerait le silence entre eux.
  it('intercale des zéros pour les périodes sans connexion', () => {
    const serie = construireSerie(
      [
        { debut: new Date('2026-03-18T14:10:00Z'), nombre: 3 },
        { debut: new Date('2026-03-18T11:00:00Z'), nombre: 1 },
      ],
      'heure',
      MAINTENANT,
    );
    const parLibelle = new Map(serie.map((p) => [p.libelle, p.nombre]));
    expect(parLibelle.get('14h')).toBe(3);
    expect(parLibelle.get('11h')).toBe(1);
    expect(parLibelle.get('12h')).toBe(0);
    expect(parLibelle.get('13h')).toBe(0);
    // Et le total des zéros n'est pas nul : la série est bien remplie.
    expect(serie.filter((p) => p.nombre === 0).length).toBe(POINTS_PAR_GRANULARITE.heure - 2);
  });

  it('va du plus ancien au plus récent, et finit sur la période courante', () => {
    const serie = construireSerie([], 'jour', MAINTENANT);
    const dates = serie.map((p) => p.debut);
    expect([...dates].sort()).toEqual(dates);
    expect(serie[serie.length - 1]?.debut).toBe('2026-03-18T00:00:00.000Z');
  });

  it('additionne plusieurs lignes tombant dans le même seau', () => {
    const serie = construireSerie(
      [
        { debut: new Date('2026-03-18T01:00:00Z'), nombre: 2 },
        { debut: new Date('2026-03-18T23:00:00Z'), nombre: 5 },
      ],
      'jour',
      MAINTENANT,
    );
    expect(serie[serie.length - 1]?.nombre).toBe(7);
  });

  it('ignore ce qui tombe hors de la fenêtre', () => {
    const serie = construireSerie(
      [{ debut: new Date('2019-01-01T00:00:00Z'), nombre: 99 }],
      'jour',
      MAINTENANT,
    );
    expect(serie.reduce((s, p) => s + p.nombre, 0)).toBe(0);
  });

  it('la fenêtre interrogée commence bien au premier seau de la série', () => {
    // Si les deux divergeaient, la requête ramènerait des lignes que la série
    // jette, ou en manquerait pour le premier point.
    for (const g of GRANULARITES) {
      const serie = construireSerie([], g, MAINTENANT);
      expect(debutDeFenetre(g, MAINTENANT).toISOString(), g).toBe(serie[0]?.debut);
    }
  });
});

describe('le classement d’une répartition', () => {
  it('ordonne du plus fréquent au moins fréquent', () => {
    const r = classer(
      [
        { cle: 'ORDINATEUR', nombre: 2 },
        { cle: 'TELEPHONE', nombre: 7 },
        { cle: 'TABLETTE', nombre: 1 },
      ],
      libelleAppareil,
    );
    expect(r.map((x) => x.cle)).toEqual(['TELEPHONE', 'ORDINATEUR', 'TABLETTE']);
    expect(r[0]?.libelle).toBe('Téléphone');
  });

  it('calcule des pourcentages sans les forcer à 100', () => {
    // Trois tiers arrondis font 99. Gonfler le premier poste pour atteindre
    // 100 afficherait un chiffre faux afin que la somme soit jolie.
    const r = classer(
      [
        { cle: 'A', nombre: 1 },
        { cle: 'B', nombre: 1 },
        { cle: 'C', nombre: 1 },
      ],
      (c) => c,
    );
    expect(r.map((x) => x.pourcentage)).toEqual([33, 33, 33]);
  });

  it('ne divise pas par zéro sur une base vide', () => {
    expect(classer([], (c) => c)).toEqual([]);
    expect(classer([{ cle: 'A', nombre: 0 }], (c) => c)[0]?.pourcentage).toBe(0);
  });

  it('départage deux ex æquo de façon stable', () => {
    // Sans second critère, l'ordre dépendrait de l'implémentation du tri et la
    // console réordonnerait ses lignes d'un rafraîchissement à l'autre.
    const r = classer(
      [
        { cle: 'ZZ', nombre: 4 },
        { cle: 'AA', nombre: 4 },
      ],
      (c) => c,
    );
    expect(r.map((x) => x.cle)).toEqual(['AA', 'ZZ']);
  });
});
