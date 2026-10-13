'use client';

// Relire la partie en cours, en traduisant « plus de partie » en valeur.
//
// `GET /api/games/current` répond 404 quand la partie est terminée ou
// abandonnée. Pour l'écran qui attend l'autre téléphone, ce 404 n'est pas une
// panne : c'est une information (« la partie vient de finir »), que
// `lib/distance/distance.ts` sait router. Toute autre erreur est relancée.
import { api, ApiError } from '@/lib/api';
import { PLUS_DE_PARTIE, type SessionLue } from './distance';

export async function relirePartie(): Promise<SessionLue | typeof PLUS_DE_PARTIE> {
  try {
    return await api<SessionLue>('/api/games/current');
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return PLUS_DE_PARTIE;
    throw err;
  }
}
