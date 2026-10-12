import { describe, expect, it } from 'vitest';
import { marquerTentative } from './marquage';

describe('marquerTentative', () => {
  it('marque tout bien placé quand la tentative est le mot', () => {
    expect(marquerTentative('robot', 'robot')).toEqual([
      { lettre: 'r', statut: 'bien-place' },
      { lettre: 'o', statut: 'bien-place' },
      { lettre: 'b', statut: 'bien-place' },
      { lettre: 'o', statut: 'bien-place' },
      { lettre: 't', statut: 'bien-place' },
    ]);
  });

  it('marque tout absent quand aucune lettre n’est commune', () => {
    // « robot » : r, o, b, o, t — aucune de ces lettres dans « chaif ».
    expect(marquerTentative('robot', 'chaif')).toEqual([
      { lettre: 'c', statut: 'absent' },
      { lettre: 'h', statut: 'absent' },
      { lettre: 'a', statut: 'absent' },
      { lettre: 'i', statut: 'absent' },
      { lettre: 'f', statut: 'absent' },
    ]);
  });

  describe('les lettres répétées — la règle qui piège toutes les implémentations', () => {
    it('ne marque que les occurrences réellement présentes dans le mot, pas plus', () => {
      // Exemple de la spec : « arbre » n'a que deux R (index 1 et 3) ; la
      // tentative « rrrrr » en propose cinq. Seuls les deux R aux index 1 et
      // 3 sont bien placés ; les trois autres n'ont plus aucune occurrence
      // disponible et restent absents. Une implémentation en une seule
      // passe qui marquerait « présente » dès que la lettre figure quelque
      // part dans le mot rendrait les trois R restants « présente », ce qui
      // est faux : il n'y a que deux R au total dans le mot.
      expect(marquerTentative('arbre', 'rrrrr')).toEqual([
        { lettre: 'r', statut: 'absent' },
        { lettre: 'r', statut: 'bien-place' },
        { lettre: 'r', statut: 'absent' },
        { lettre: 'r', statut: 'bien-place' },
        { lettre: 'r', statut: 'absent' },
      ]);
    });

    it('épuise le compte disponible même quand toutes les occurrences trouvées sont bien placées', () => {
      // « étude » (calculé sans accent pour l'exemple : e, t, u, d, e — deux
      // E, aux index 0 et 4) contre « eleve » (e, l, e, v, e — trois E).
      // Les DEUX occurrences du mot sont consommées par les deux E bien
      // placés (index 0 et 4) ; le troisième E de la tentative (index 2)
      // n'a donc plus aucune occurrence disponible et doit rester absent —
      // pas « présente ». C'est exactement le cas qu'une implémentation en
      // une seule passe rate : elle verrait « e » dans le mot et marquerait
      // l'index 2 « présente », en comptant une troisième fois une lettre
      // qui n'existe que deux fois.
      expect(marquerTentative('etude', 'eleve')).toEqual([
        { lettre: 'e', statut: 'bien-place' },
        { lettre: 'l', statut: 'absent' },
        { lettre: 'e', statut: 'absent' },
        { lettre: 'v', statut: 'absent' },
        { lettre: 'e', statut: 'bien-place' },
      ]);
    });

    it('marque présente seulement tant qu’il reste une occurrence non consommée', () => {
      // « robot » (r, o, b, o, t) contre « otter » (o, t, t, e, r) : aucune
      // lettre bien placée, mais O (une occurrence dispo), T (une seule
      // occurrence dispo, donc seul le premier T — index 1 — compte) et R
      // (une occurrence dispo) sont chacun présents une fois.
      expect(marquerTentative('robot', 'otter')).toEqual([
        { lettre: 'o', statut: 'present' },
        { lettre: 't', statut: 'present' },
        { lettre: 't', statut: 'absent' },
        { lettre: 'e', statut: 'absent' },
        { lettre: 'r', statut: 'present' },
      ]);
    });

    it('marque chaque occurrence présente d’un anagramme partiel', () => {
      // « etude » (e, t, u, d, e) contre « duvet » (d, u, v, e, t) : aucune
      // lettre bien placée (positions toutes différentes), mais D, U, E, T
      // ont chacun au moins une occurrence disponible ; V n'existe pas dans
      // le mot.
      expect(marquerTentative('etude', 'duvet')).toEqual([
        { lettre: 'd', statut: 'present' },
        { lettre: 'u', statut: 'present' },
        { lettre: 'v', statut: 'absent' },
        { lettre: 'e', statut: 'present' },
        { lettre: 't', statut: 'present' },
      ]);
    });
  });

  it('refuse un mot ou une tentative qui ne comptent pas cinq lettres', () => {
    expect(() => marquerTentative('robo', 'robot')).toThrow(/5 lettres/);
    expect(() => marquerTentative('robot', 'robo')).toThrow(/5 lettres/);
  });
});
