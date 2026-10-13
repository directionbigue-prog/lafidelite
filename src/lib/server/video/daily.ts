// Daily.co — la salle vidéo privée d'un couple, et le jeton pour y entrer.
//
// UNE SALLE PAR COUPLE, PRIVÉE. Son nom est dérivé de l'id du couple, mais
// le nom ne suffit pas pour entrer : une salle `privacy: 'private'` exige un
// jeton signé par notre clé API, et seule la route `/api/video/jeton` en
// délivre — après `requireAuth` et la vérification que l'appelant appartient
// à ce couple ACTIF. Deviner le nom d'une salle ne donne rien.
//
// Inerte sans `DAILY_API_KEY`, comme tous les fournisseurs optionnels de ce
// dépôt : la route répond 503 VIDEO_NOT_CONFIGURED et l'écran cache le bouton.
//
// La clé ne quitte jamais le serveur ; le client ne reçoit que l'URL de la
// salle et un jeton qui expire.
import 'server-only';

const API = 'https://api.daily.co/v1';

/** Durée d'un jeton : une longue soirée. Au-delà, Daily éjecte de la salle. */
export const DUREE_JETON_S = 4 * 60 * 60;

export function dailyConfigure(): boolean {
  return Boolean(process.env.DAILY_API_KEY?.trim());
}

/**
 * Le nom de la salle d'un couple. Daily accepte `[A-Za-z0-9_-]`, 128 car. au
 * plus ; un id cuid y tient sans transformation, on le préfixe pour qu'une
 * salle de ce produit se reconnaisse dans le tableau de bord Daily.
 */
export function nomDeSalle(coupleId: string): string {
  return `cf-${coupleId.replace(/[^A-Za-z0-9_-]/g, '')}`.slice(0, 128);
}

async function appel(chemin: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${chemin}`, {
    ...init,
    headers: {
      authorization: `Bearer ${process.env.DAILY_API_KEY?.trim() ?? ''}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
    // Une salle ou un jeton ne se met jamais en cache.
    cache: 'no-store',
  });
}

export class ErreurDaily extends Error {
  constructor(
    readonly statut: number,
    message: string,
  ) {
    super(message);
    this.name = 'ErreurDaily';
  }
}

/** L'URL de la salle du couple, créée au premier appel. */
export async function salleDuCouple(coupleId: string): Promise<string> {
  const nom = nomDeSalle(coupleId);

  const existante = await appel(`/rooms/${nom}`);
  if (existante.ok) {
    const salle = (await existante.json()) as { url: string };
    return salle.url;
  }
  if (existante.status !== 404) {
    throw new ErreurDaily(existante.status, `Daily GET /rooms/${nom} → ${existante.status}`);
  }

  const creee = await appel('/rooms', {
    method: 'POST',
    body: JSON.stringify({
      name: nom,
      privacy: 'private',
      properties: {
        // Deux personnes : ce n'est pas une salle de réunion.
        max_participants: 2,
        enable_prejoin_ui: false,
        enable_chat: false,
        enable_screenshare: false,
        // Aucun enregistrement : un appel de couple ne laisse pas de trace.
        enable_recording: false,
      },
    }),
  });
  if (!creee.ok) {
    // Deux partenaires qui lancent l'appel à la même seconde : le second
    // trouve la salle déjà créée par le premier. On la relit.
    const relue = await appel(`/rooms/${nom}`);
    if (relue.ok) return ((await relue.json()) as { url: string }).url;
    throw new ErreurDaily(creee.status, `Daily POST /rooms → ${creee.status}`);
  }
  return ((await creee.json()) as { url: string }).url;
}

/** Un jeton d'entrée nominatif pour cette salle, valable `DUREE_JETON_S`. */
export async function jetonPour(
  coupleId: string,
  utilisateur: { id: string; nom: string },
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + DUREE_JETON_S;
  const r = await appel('/meeting-tokens', {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        room_name: nomDeSalle(coupleId),
        user_id: utilisateur.id,
        user_name: utilisateur.nom,
        exp,
        eject_at_token_exp: true,
        is_owner: false,
      },
    }),
  });
  if (!r.ok) throw new ErreurDaily(r.status, `Daily POST /meeting-tokens → ${r.status}`);
  return ((await r.json()) as { token: string }).token;
}
