// Enregistre une connexion réussie, pour la console d'administration.
//
// LA RÈGLE DE CE FICHIER TIENT EN UNE PHRASE : cela ne doit JAMAIS faire
// échouer une connexion. Une statistique est un confort ; se connecter est le
// produit. Toute erreur est donc avalée et journalisée, et l'écriture part
// après que la réponse est rendue.
//
// Ce qui est stocké est volontairement pauvre — voir `lib/admin/connexions.ts`
// pour le pourquoi : une classe d'appareil, un code pays, une méthode. Ni
// l'adresse IP, ni la chaîne « user-agent » n'entrent en base.

import 'server-only';
import { after } from 'next/server';
import { createLogger } from '@/lib/server/logger';
import { prisma } from '@/lib/server/prisma';
import { typeAppareil, paysValide } from '@/lib/admin/connexions';

const log = createLogger();

/** Par quel chemin la session a été ouverte. */
export const METHODES = ['MOT_DE_PASSE', 'VERIFICATION', 'GOOGLE'] as const;

export type MethodeConnexion = (typeof METHODES)[number];

const LIBELLES_METHODE: Record<MethodeConnexion, string> = {
  MOT_DE_PASSE: 'Mot de passe',
  VERIFICATION: 'Premier accès',
  GOOGLE: 'Google',
};

export function libelleMethode(m: string): string {
  return LIBELLES_METHODE[m as MethodeConnexion] ?? m;
}

/**
 * Ce qu'on retient d'une requête, avant toute écriture.
 *
 * Séparé de l'insertion pour être testable sans base : la dérivation est la
 * seule partie où l'on peut se tromper, et c'est elle qui décide ce qui NE
 * sera pas gardé.
 */
export function donneesDeConnexion(
  headers: Headers,
  methode: MethodeConnexion,
): { appareil: string; pays: string | null; methode: MethodeConnexion } {
  return {
    appareil: typeAppareil(headers.get('user-agent')),
    // `x-vercel-ip-country` est fourni gratuitement par la plateforme. En
    // développement il est absent, et `paysValide` refuse tout ce qui n'est
    // pas deux lettres — un en-tête reste une entrée, même venant de l'infra.
    pays: paysValide(headers.get('x-vercel-ip-country')),
    methode,
  };
}

/**
 * Enregistre la connexion, après la réponse.
 *
 * `after()` plutôt qu'un `await` : la requête de connexion coûte déjà une
 * vérification de mot de passe et plusieurs allers-retours vers un Postgres
 * distant (~320 ms de plancher sur cette base), et une insertion de
 * statistique n'a aucune raison d'ajouter à ce que l'utilisateur attend.
 *
 * Le `try/catch` est doublé, et les deux couches servent : `after()` lui-même
 * lève hors d'un contexte de requête (c'est ce qui arrive dans les tests
 * unitaires des routes), et l'insertion peut échouer si la migration n'est pas
 * encore appliquée. Dans les deux cas la connexion aboutit, et la console
 * affiche simplement un trou — ce qui est le bon compromis.
 */
export function enregistrerConnexion(args: {
  headers: Headers;
  methode: MethodeConnexion;
  userId: string | null;
  requestId?: string;
}): void {
  const { headers, methode, userId, requestId } = args;
  try {
    after(async () => {
      try {
        await prisma.connexionEvent.create({
          data: { userId, ...donneesDeConnexion(headers, methode) },
        });
      } catch (err) {
        log.warn('enregistrerConnexion: insertion impossible, statistique perdue', {
          requestId,
          methode,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  } catch (err) {
    // Hors contexte de requête. On ne tente pas d'écrire en synchrone : ce
    // serait ajouter une latence à la connexion pour sauver un compteur.
    log.warn('enregistrerConnexion: pas de contexte de requête, statistique ignoree', {
      requestId,
      methode,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
