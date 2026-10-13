import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PACKS } from '@/lib/game/packs';
import { buildLandingDesignData } from '@/lib/landing/design-data';
import {
  cheminAchat,
  destinationApresConnexion,
  lirePackChoisi,
  serialiserPackChoisi,
  VALIDITE_PACK_CHOISI_MS,
} from './pack-choisi';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (relatif: string) => readFileSync(path.join(SRC, relatif), 'utf8');

const T0 = 1_800_000_000_000;

describe('lirePackChoisi', () => {
  it('rend un pack en vente choisi à l’instant', () => {
    expect(lirePackChoisi(serialiserPackChoisi('WEEKEND', T0), T0 + 1000)).toBe('WEEKEND');
  });

  it('oublie un choix de plus d’une heure', () => {
    const brut = serialiserPackChoisi('WEEKEND', T0);
    expect(lirePackChoisi(brut, T0 + VALIDITE_PACK_CHOISI_MS)).toBe('WEEKEND');
    expect(lirePackChoisi(brut, T0 + VALIDITE_PACK_CHOISI_MS + 1)).toBeNull();
  });

  it('refuse un pack retiré de la vente, gratuit ou inconnu', () => {
    for (const pack of ['ANNUEL', 'DECOUVERTE', 'INCONNU']) {
      expect(lirePackChoisi(serialiserPackChoisi(pack, T0), T0), pack).toBeNull();
    }
  });

  it('ignore une valeur illisible au lieu de planter', () => {
    for (const brut of [null, '', '{', '"WEEKEND"', '{"pack":3,"at":1}', 'null']) {
      expect(lirePackChoisi(brut, T0), String(brut)).toBeNull();
    }
  });

  it('refuse un horodatage dans le futur', () => {
    expect(lirePackChoisi(serialiserPackChoisi('WEEKEND', T0 + 60_000), T0)).toBeNull();
  });
});

describe('destinationApresConnexion', () => {
  it('suit un `next` du site', () => {
    expect(destinationApresConnexion('/acheter/WEEKEND', null)).toBe('/acheter/WEEKEND');
  });

  it('refuse une redirection vers un autre site', () => {
    expect(destinationApresConnexion('//evil.example/x', null)).toBe('/jeu');
    expect(destinationApresConnexion('https://evil.example', null)).toBe('/jeu');
  });

  it('à défaut de `next`, ouvre le paiement du pack mémorisé', () => {
    expect(destinationApresConnexion(null, 'INTEGRAL')).toBe('/acheter/INTEGRAL');
  });

  it('sinon, /jeu', () => {
    expect(destinationApresConnexion(null, null)).toBe('/jeu');
  });
});

describe('chaque clic sur un pack payant mène à sa caisse', () => {
  it('les cartes payantes de l’accueil pointent vers /acheter/[pack]', () => {
    const accueil = lire('app/page.tsx');
    expect(accueil).toContain('cheminAchat(card.id)');
    expect(accueil).not.toContain("card.gratuit ? PLAY_HREF : '#inscription'");
    for (const carte of buildLandingDesignData().pricingCards.filter((c) => !c.gratuit)) {
      expect(carte.ctaLabel, carte.id).toBe(`Choisir ${carte.nom}`);
    }
  });

  it('le bouton d’achat sans session mène à /acheter/[pack], pas à l’inscription nue', () => {
    const bouton = lire('components/game/BoutonAcheterPack.tsx');
    expect(bouton).toContain('href={cheminAchat(packId)}');
    expect(bouton).not.toContain('href="/inscription"');
  });

  it('/acheter lance la commande sans second clic une fois connecté', () => {
    const page = lire('app/acheter/[pack]/page.tsx');
    expect(page).toMatch(/<BoutonAcheterPack[^>]*automatique/);
    // Sans session : le retour vers la caisse voyage dans `next`.
    expect(page).toContain('/inscription?next=${retour}');
    expect(page).toContain('/connexion?next=${retour}');
    expect(page).toContain('memoriserPackChoisi(pack.id)');
  });

  it('le départ automatique remplace l’entrée d’historique', () => {
    // Sinon « retour » depuis PayTech retombe sur /acheter, qui relance
    // aussitôt un paiement : le visiteur ne peut plus revenir en arrière.
    const bouton = lire('components/game/BoutonAcheterPack.tsx');
    expect(bouton).toContain('window.location.replace(commande.paymentUrl)');
    expect(bouton).toMatch(/void acheter\(true\)/);
  });

  it('connexion et vérification reviennent vers le pack choisi', () => {
    for (const fichier of ['app/connexion/LoginForm.tsx', 'app/verify-email/VerifyEmailForm.tsx']) {
      expect(lire(fichier), fichier).toContain('destinationApresConnexion(');
    }
    // L'inscription transmet `next` à /verify-email, qui ouvre la session.
    expect(lire('app/inscription/SignupForm.tsx')).toMatch(/&next=\$\{encodeURIComponent/);
  });

  it('chaque pack en vente a une adresse de caisse', () => {
    for (const pack of PACKS.filter((p) => p.prix > 0 && p.enVente)) {
      expect(cheminAchat(pack.id)).toBe(`/acheter/${pack.id}`);
    }
  });
});
