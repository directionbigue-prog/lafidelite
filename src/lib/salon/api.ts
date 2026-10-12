// Le client des quatre routes /api/salon.
//
// L'écran de jeu n'en utilise que trois : il passe par POST /api/salon,
// idempotente, qui couvre à la fois « commencer » et « reprendre ».
// `GET /api/salon/current` sert au menu du Salon, qui a besoin de savoir
// s'il y a une partie en cours SANS en créer une — c'est toute la
// différence, et c'est pourquoi la route existe séparément.
//
// Rassemblé ici pour que l'écran de jeu ne contienne que du jeu, et pour
// que les formes de requête restent typées en un seul endroit.
import { api } from '@/lib/api';

export interface PartieDuSalon {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly state: unknown;
  readonly moveCount: number;
}

/** Crée une partie, ou renvoie celle en cours : la route est idempotente. */
export function commencerPartie(kind: string): Promise<PartieDuSalon> {
  return api<PartieDuSalon>('/api/salon', { method: 'POST', body: { kind } });
}

/**
 * La partie en cours, ou `null` s'il n'y en a pas.
 *
 * À ne pas confondre avec `commencerPartie` : celle-ci CRÉE la partie
 * quand il n'y en a pas. Pour un menu qui se contente d'afficher l'état,
 * ce serait un effet de bord — ouvrir le Salon lancerait des parties que
 * personne n'a demandées, et l'index unique en interdirait ensuite
 * d'autres.
 */
export function partieEnCours(kind: string): Promise<PartieDuSalon | null> {
  return api<{ game: PartieDuSalon | null }>(
    `/api/salon/current?kind=${encodeURIComponent(kind)}`,
  ).then((res) => res.game);
}

// `state` est délibérément `unknown` : la route sait relire chaque jeu par
// son propre schéma (`lib/salon/jeux.ts`), et ce client sert les DEUX
// écrans — le typer sur `EtatPlateau` (les dames) empêcherait l'Awalé de
// compiler alors que la route, elle, était déjà générique.
export function sauvegarderEtat(
  id: string,
  state: unknown,
  moveCount: number,
): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/salon/${id}/state`, {
    method: 'PUT',
    body: { state, moveCount },
  });
}

export function terminerPartie(
  id: string,
  outcome: 'COMPLETED' | 'ABANDONED',
): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/salon/${id}/end`, {
    method: 'POST',
    body: { outcome },
  });
}
