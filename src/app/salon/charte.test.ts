// La charte graphique du Salon, pour les cinq jeux d'un coup.
//
// ── Pourquoi ce fichier existe ────────────────────────────────────────
//
// Les cinq écrans de jeu ont d'abord été rendus sur un fond crème. Le
// canevas de design le montrait pour le damier, l'écran des dames l'a
// suivi, et les quatre jeux suivants ont recopié l'écran des dames. La
// décision n'a jamais été reprise : elle s'est propagée.
//
// Deux conséquences, dont une seule se voyait :
//
//  1. On quittait `/salon` — sombre, dans l'`AppShell` — pour cinq écrans
//     clairs. La rubrique entière sortait de la charte du produit.
//  2. Moins visible et plus grave : `Alert` n'a pas de version claire. Ses
//     trois tons écrivent en `text-cream`. Sur fond crème, chaque message
//     d'erreur du Salon s'affichait donc en crème sur crème — illisible,
//     sans qu'aucun test ne puisse le dire.
//
// Chaque page portait pourtant un test du fond. Cinq tests, un par jeu,
// tous écrits `expect(page).toContain('ground="cream"')`. Ils n'ont rien
// empêché : ils vérifiaient que la copie était fidèle, pas qu'elle était
// juste. Un tripwire recopié cinq fois verrouille la dérive au lieu de la
// signaler.
//
// D'où ce fichier unique, qui remplace les cinq. Il ne demande pas « cette
// page ressemble-t-elle aux autres ? » mais « cette page tient-elle sur le
// fond sombre du produit ? » — et un sixième jeu qui arriverait avec les
// réflexes d'un thème clair le ferait rougir sans qu'on ait à y penser.
//
// ── Ce qu'il ne peut pas faire ────────────────────────────────────────
//
// Rien ici ne prouve un RENDU : ce dépôt n'a ni jsdom ni Testing Library,
// donc aucun composant ne peut être monté (voir CLAUDE.md). Ce test lit du
// texte. Il attrape une classe de thème clair laissée sur un fond sombre —
// ce qui est précisément le défaut qui s'est produit — et rien de plus.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SALON_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Les cinq jeux, par le dossier qui porte leur écran. */
const JEUX = ['dames', 'awale', 'ludo', 'mot', 'mots-croises'] as const;

function sourceEcran(jeu: string): string {
  return readFileSync(path.join(SALON_DIR, jeu, 'page.tsx'), 'utf8');
}

/**
 * Le code sans ses commentaires.
 *
 * Indispensable ici : les commentaires de ces fichiers RACONTENT l'ancien
 * fond crème et nomment les classes qu'on bannit. Chercher dans le fichier
 * entier ferait échouer chaque écran sur sa propre explication — un test
 * qui punit la documentation de son propre défaut.
 */
function codeSeul(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((ligne) => !ligne.trimStart().startsWith('//'))
    .join('\n');
}

describe('la charte du Salon tient sur les cinq écrans', () => {
  it('trouve bien les cinq écrans', () => {
    for (const jeu of JEUX) {
      expect(sourceEcran(jeu).length, jeu).toBeGreaterThan(1000);
    }
  });

  it('les rend tous sur le fond du produit, jamais sur un fond à eux', () => {
    // `FocusLayout` énumère trois fonds et n'en autorise que deux hors ink,
    // chacun attaché à un écran précis du canevas (la manche Scénarios, le
    // passage du téléphone). Aucun n'est un écran du Salon.
    const horsCharte = JEUX.filter((jeu) => !codeSeul(sourceEcran(jeu)).includes('ground="ink"'));
    expect(horsCharte).toEqual([]);
  });

  // Les classes d'un thème CLAIR, qui deviennent illisibles sur `ink`.
  // `plum-deep` en `text-`/`border-`/`bg-` est du décor de page ; le même
  // ton en `ring-` est l'anneau intérieur d'un pion crème et reste juste,
  // d'où les préfixes explicites plutôt qu'une recherche du mot seul.
  const INTERDITS: readonly [motif: RegExp, pourquoi: string][] = [
    [/\btext-plum-deep\b/, 'texte prune sur fond ink : illisible'],
    [/\bborder-plum-deep\//, 'liseré prune sur fond ink : invisible'],
    [/\bbg-white\b/, 'surface blanche sur fond ink'],
    [/\btext-wine\b/, 'wine sur ink plafonne vers 1,7:1 de contraste'],
    [/variant="inverse"/, 'le bouton des fonds clairs'],
    [/variant="secondary-inverse"/, 'le bouton secondaire des fonds clairs'],
  ];

  for (const [motif, pourquoi] of INTERDITS) {
    it(`n’emploie nulle part ${motif.source} — ${pourquoi}`, () => {
      const coupables = JEUX.filter((jeu) => motif.test(codeSeul(sourceEcran(jeu))));
      expect(coupables).toEqual([]);
    });
  }

  it('mord vraiment : le motif reconnaît la classe qu’il bannit', () => {
    // Sans ceci, une faute de frappe dans l'une des expressions ci-dessus
    // donnerait six tests verts qui ne regardent rien. On vérifie donc que
    // chaque motif reconnaît un exemple de ce qu'il prétend interdire.
    const exemples = [
      'className="text-plum-deep"',
      'className="border-plum-deep/20"',
      'className="bg-white"',
      'className="text-wine"',
      'variant="inverse"',
      'variant="secondary-inverse"',
    ];
    for (const [i, [motif]] of INTERDITS.entries()) {
      const exemple = exemples[i];
      expect(exemple, `exemple manquant pour ${motif.source}`).toBeDefined();
      expect(motif.test(exemple ?? ''), `${motif.source} ne reconnaît pas ${exemple}`).toBe(true);
    }
  });
});
