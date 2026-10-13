// Refuse une requête venue d'un autre site, pour les routes qui ne peuvent
// pas exiger le jeton CSRF parce qu'aucune session n'existe encore (lien
// d'invitation, bascule de compte depuis l'écran de connexion).
//
// Un navigateur envoie toujours `Origin` sur un POST `fetch`. Son absence
// (outil en ligne de commande) n'est pas un vecteur de CSRF : seule une page
// tierce peut faire agir le navigateur d'un visiteur à sa place.
import 'server-only';
import type { NextRequest } from 'next/server';

export function origineEtrangere(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host !== (req.headers.get('host') ?? req.nextUrl.host);
  } catch {
    return true;
  }
}
