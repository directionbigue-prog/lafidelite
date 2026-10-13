// Lire les pistes audio/vidéo d'un appel Daily, sans React ni navigateur.
//
// `callObject.participants()` rend un objet `{ local, <session_id>: … }`.
// On n'en garde que ce que la fenêtre vidéo affiche : ma caméra, la caméra et
// le micro du partenaire, et s'il est là. Une piste n'est rendue que si
// Daily la dit `playable` — une piste « loading » ou « off » branchée sur un
// <video> donne un carré noir qu'on prend pour un bug.

export interface PisteBrute {
  state?: string;
  persistentTrack?: unknown;
}

export interface ParticipantBrut {
  local?: boolean;
  user_name?: string;
  tracks?: { video?: PisteBrute; audio?: PisteBrute };
}

export interface Pistes<T> {
  maVideo: T | null;
  saVideo: T | null;
  sonAudio: T | null;
  partenairePresent: boolean;
  nomPartenaire: string | null;
}

function jouable<T>(p: PisteBrute | undefined): T | null {
  return p && p.state === 'playable' && p.persistentTrack ? (p.persistentTrack as T) : null;
}

export function pistesDepuis<T = MediaStreamTrack>(
  participants: Record<string, ParticipantBrut> | null | undefined,
): Pistes<T> {
  const tous = Object.values(participants ?? {});
  const moi = tous.find((p) => p.local);
  // La salle est limitée à deux : le premier non-local est le partenaire.
  const lui = tous.find((p) => !p.local);
  return {
    maVideo: jouable<T>(moi?.tracks?.video),
    saVideo: jouable<T>(lui?.tracks?.video),
    sonAudio: jouable<T>(lui?.tracks?.audio),
    partenairePresent: Boolean(lui),
    nomPartenaire: lui?.user_name?.trim() || null,
  };
}
