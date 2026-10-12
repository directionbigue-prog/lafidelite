import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildLandingDesignData } from './design-data';
import { PACKS, PACKS_VISIBLES, LIBELLE_DEVISE } from '@/lib/game/packs';
import { NOMS_THEMES } from '@/lib/game/themes';

// Ce que ces tests gardent, et pourquoi ils existent.
//
// Le 02/10/2026, les trois paliers payants sont passés d'une échelle de
// contenu à une échelle de DURÉE, et l'Annuel a été retiré de la vente. Le
// registre a suivi le même jour ; l'accueil, non. Il a continué à servir en
// production :
//
//   « Essentiel · 4 900 F · par mois · 6 thèmes sur 8 »
//   « Intégral · 9 900 F · Par mois · ou 118 800 F l'année »
//   (et aucune trace du Week-end à 2 000, le palier le moins cher)
//
// quand la caisse vendait « Semaine · 4 900 · 7 jours · les huit thèmes ».
// Quelqu'un qui payait 4 900 en croyant acheter un mois recevait une semaine.
//
// La cause n'était pas une faute de frappe : les PRIX étaient déjà dérivés du
// registre, mais les NOMS, les PÉRIODES et les compteurs de thèmes restaient
// écrits à la main dans `app/page.tsx`. Aucun test ne reliait les deux, donc
// rien n'a rougi. Ces assertions sont ce lien.

const here = dirname(fileURLToPath(import.meta.url));
const ACCUEIL = resolve(here, '../../app/page.tsx');
const TARIFS = resolve(here, '../../app/tarifs/page.tsx');

/**
 * Retire commentaires de ligne, de bloc et commentaires JSX.
 *
 * Indispensable, et la leçon est déjà payée ailleurs dans ce dépôt :
 * `cron-get-alias.test.ts` est resté vert sur un `// export const GET = POST;`
 * commenté. Ici le piège est symétrique — les commentaires de ce correctif
 * CITENT les tournures interdites pour expliquer la régression, donc un test
 * qui ne les retire pas échoue sur sa propre documentation.
 */
function sansCommentaires(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Le TEXTE que la page affiche : ni balises, ni styles, ni commentaires.
 *
 * Nécessaire pour que les assertions suivantes mordent sans crier au loup.
 * Chercher « mois » dans tout le fichier confondrait une phrase anodine avec
 * le nom d'un pack ; chercher `>Mois<` laisserait passer le défaut réel, où
 * le nom était SEUL sur sa ligne entre deux balises. On ne garde donc que les
 * lignes sans `<`, `>`, `{`, `}` ni `=` — vérifié : sur la page corrigée,
 * aucune ne contient de nom de pack ni de période.
 */
function texteVisible(src: string): string {
  return sansCommentaires(src)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/[<>{}=]/.test(l))
    .join('\n');
}

const accueil = sansCommentaires(readFileSync(ACCUEIL, 'utf8'));
const texteAccueil = texteVisible(readFileSync(ACCUEIL, 'utf8'));
const tarifs = sansCommentaires(readFileSync(TARIFS, 'utf8'));
const cartes = buildLandingDesignData().pricingCards;

/** `4900` → `4 900`, séparateur fin insécable, comme les deux écrans. */
function groupe(montant: number): string {
  return String(montant).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

describe('les cartes de l’accueil viennent du registre', () => {
  it('en affiche exactement une par pack en vente, dans l’ordre du registre', () => {
    expect(cartes.map((c) => c.id)).toEqual(PACKS_VISIBLES.map((p) => p.id));
  });

  it('reprend le nom, le prix et la période du registre sans les réécrire', () => {
    for (const pack of PACKS_VISIBLES) {
      const carte = cartes.find((c) => c.id === pack.id);
      expect(carte, pack.id).toBeDefined();
      expect(carte!.nom, pack.id).toBe(pack.nom);
      if (pack.prix === 0) {
        expect(carte!.prix, pack.id).toBe('Gratuit');
      } else {
        expect(carte!.prix, pack.id).toBe(`${groupe(pack.prix)} ${LIBELLE_DEVISE}`);
        // La période est ce qui distingue les paliers depuis le 02/10/2026 :
        // c'est la seule chose qui change entre 2 000 et 9 900.
        expect(carte!.mention, pack.id).toBe(pack.periode);
      }
    }
  });

  it('annonce le catalogue entier là où le pack l’ouvre vraiment', () => {
    for (const pack of PACKS_VISIBLES) {
      const carte = cartes.find((c) => c.id === pack.id);
      const lignes = carte!.details.join(' | ');
      if (pack.themes.length === NOMS_THEMES.length) {
        expect(lignes, pack.id).toContain(`Les ${NOMS_THEMES.length} thèmes`);
        // Le défaut exact qui a été servi : « 6 thèmes sur 8 » sur un palier
        // qui les ouvre tous les huit.
        expect(lignes, pack.id).not.toMatch(/\d+ thèmes sur \d+/);
      } else {
        expect(lignes, pack.id).toMatch(/thème/);
        expect(lignes, pack.id).not.toContain(`Les ${NOMS_THEMES.length} thèmes`);
      }
    }
  });

  it('dit la vérité sur le Salon, palier par palier', () => {
    for (const pack of PACKS_VISIBLES) {
      const carte = cartes.find((c) => c.id === pack.id);
      const lignes = carte!.details.join(' | ');
      expect(lignes, pack.id).toContain(pack.salon ? 'Le Salon inclus' : 'Le Salon non inclus');
    }
  });
});

describe('un pack retiré de la vente ne reparaît nulle part', () => {
  // L'Annuel RESTE dans le registre — le supprimer ferait rendre `null` à
  // `packParId` pour des clients qui ont payé. Il doit donc être filtré par
  // chaque vitrine, et c'est le filtre qu'on teste, pas son absence.
  const retires = PACKS.filter((p) => !p.enVente);

  it('il y a bien au moins un pack retiré, sinon ce test ne prouve rien', () => {
    expect(retires.length).toBeGreaterThan(0);
  });

  it('aucune carte ne porte son identifiant ni son nom', () => {
    for (const pack of retires) {
      expect(
        cartes.map((c) => c.id),
        pack.id,
      ).not.toContain(pack.id);
      expect(
        cartes.map((c) => c.nom),
        pack.id,
      ).not.toContain(pack.nom);
    }
  });

  it('son prix n’apparaît pas dans le code de l’accueil', () => {
    for (const pack of retires) {
      // « 118 800 F l'année » était écrit sous la carte Intégral : un prix
      // affiché pour quelque chose qui n'était plus à vendre.
      expect(accueil, pack.id).not.toContain(groupe(pack.prix));
    }
  });
});

describe('l’accueil n’écrit plus en dur ce que le registre décide', () => {
  it('n’affiche aucun nom de pack écrit à la main', () => {
    for (const pack of PACKS) {
      // Mot entier et sans égard à la casse : le défaut servi écrivait
      // « Essentiel » seul sur sa ligne, donc une recherche de `>Essentiel<`
      // ne l'aurait pas vu.
      const motEntier = new RegExp(`(^|[^\\p{L}])${pack.nom}([^\\p{L}]|$)`, 'iu');
      expect(texteAccueil, pack.nom).not.toMatch(motEntier);
    }
  });

  it('n’affiche aucune période de pack écrite à la main', () => {
    for (const pack of PACKS) {
      if (!pack.periode) continue;
      // SANS ÉGARD À LA CASSE, et ce détail est la raison d'être du test :
      // le registre dit « par mois », la page servie disait « Par mois, sans
      // engagement ». Une comparaison sensible à la casse restait verte sur
      // la régression exacte — vérifié en la réinjectant.
      expect(texteAccueil.toLowerCase(), pack.periode).not.toContain(pack.periode.toLowerCase());
    }
  });

  it('ne compte pas les thèmes à la main', () => {
    // « 6 thèmes sur 8 » a survécu à l'ouverture des trois paliers payants au
    // catalogue entier, parce qu'il était écrit dans le JSX et nulle part
    // ailleurs. Seul `detailsDuPack` a le droit de formuler ce décompte.
    expect(texteAccueil).not.toMatch(/\d+\s*thèmes?\s+sur\s+\d+/i);
  });

  it('passe par pricingCards plutôt que par des champs de prix séparés', () => {
    expect(accueil).toContain('pricingCards');
    for (const mort of ['priceFree', 'pricePack', 'priceSub', 'priceAnnuel']) {
      expect(accueil, mort).not.toContain(mort);
    }
  });

  it('ne promet pas une monnaie de points que le produit n’a pas', () => {
    // Le Salon est scellé hors du score du couple (invariant CLAUDE.md), donc
    // « 10 pts la partie » sur trois de ses cartes décrivait un barème
    // inexistant, et le pied de la section tarifs parlait de points « débités ».
    expect(accueil).not.toContain('pts la partie');
    expect(accueil).not.toContain('points ne sont jamais débités');
  });

  it('ne dit pas le Salon gratuit, puisque le palier gratuit l’exclut', () => {
    const gratuitOuvreLeSalon = PACKS_VISIBLES.some((p) => p.prix === 0 && p.salon);
    expect(gratuitOuvreLeSalon, 'le registre a changé, ce test doit suivre').toBe(false);
    expect(accueil).toContain('salonAcces');
    expect(buildLandingDesignData().salonAcces).not.toMatch(/^Gratuit$/);
  });
});

describe('une seule étiquette de devise dans tout le produit', () => {
  it('les deux écrans affichent le même libellé', () => {
    expect(LIBELLE_DEVISE).toBe('FCFA');
    expect(buildLandingDesignData().zoneLabel).toBe(LIBELLE_DEVISE);
    for (const carte of cartes.filter((c) => !c.gratuit)) {
      expect(carte.prix, carte.id).toContain(LIBELLE_DEVISE);
    }
  });

  it('/tarifs n’affiche plus le code ISO destiné au prestataire', () => {
    // `pack.devise` vaut « XOF » : c'est ce que la caisse envoie, pas ce qu'on
    // lit à Dakar. Cet écran affichait « 4 900 XOF » quand l'accueil affichait
    // « 4 900 FCFA » pour la même somme.
    expect(tarifs).not.toContain('pack.devise');
    expect(tarifs).toContain('LIBELLE_DEVISE');
  });
});

describe('la description de /tarifs suit le registre', () => {
  it('nomme les packs en vente et aucun autre', () => {
    const description = /description:\s*`([^`]*)`/.exec(tarifs)?.[1];
    expect(description, 'la description doit être un gabarit dérivé').toBeDefined();
    expect(description).toContain('PACKS_VISIBLES');
    // La version écrite à la main — « Découverte, Essentiel, Intégral,
    // Annuel » — vendait l'Annuel dans l'extrait de recherche et nommait deux
    // paliers sous des noms qui n'existaient plus.
    for (const pack of PACKS.filter((p) => !p.enVente)) {
      expect(description, pack.nom).not.toContain(pack.nom);
    }
  });
});
