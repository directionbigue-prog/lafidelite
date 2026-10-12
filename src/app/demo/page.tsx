// /demo — the playable taste of the game, for a signed-in account.
//
// It was public until the free-play rule arrived: unlimited anonymous
// replays are exactly what that rule exists to stop, so the trial now costs
// an account. `DemoGame` holds the gate (`useUser`), because this file is a
// server component and owns the metadata below.
//
// What has NOT changed: the demo touches no API route, creates no row, and
// never spends the account's one free game. It is a rehearsal against a
// fictional partner, not a game.
import type { Metadata } from 'next';
import { DemoGame } from '@/components/demo/DemoGame';

export const metadata: Metadata = {
  title: 'Essayer une partie — Cœur Fidèle',
  description:
    'Jouez une partie de démonstration de Cœur Fidèle : trois manches, neuf questions, contre un personnage de démonstration.',
};

export default function DemoPage() {
  return <DemoGame />;
}
