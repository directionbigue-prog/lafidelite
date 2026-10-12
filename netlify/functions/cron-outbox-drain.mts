// Ordonnanceur Netlify → /api/cron/outbox-drain
//
// Coquille volontairement vide de toute décision : tout vit dans
// `src/lib/server/cron/appel-planifie.ts`, qui est testé. Ce dossier n'est ni
// couvert par `eslint src/` ni par `tsc --noEmit` (dont le `include` s'arrête
// à `src/**/*`), donc le code écrit ici échapperait aux garde-fous.
//
// L'horaire est déclaré dans `netlify.toml`, pas ici : un seul endroit pour
// lire les six rythmes, et aucune dépendance à `@netlify/functions`.
import { executerCron } from '../../src/lib/server/cron/appel-planifie';

export default async () => {
  // Pas de try/catch : une exception marque l'invocation en échec dans
  // l'interface Netlify. L'avaler rendrait un cron mort indiscernable d'un
  // cron tranquille — exactement la panne du 02/10/2026.
  const { statut, corps } = await executerCron('outbox-drain');
  console.log(`cron outbox-drain : ${statut} ${corps}`);
};
