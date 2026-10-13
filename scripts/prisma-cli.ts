// scripts/prisma-cli.ts
//
// Lance la CLI Prisma avec les variables de `.env` puis `.env.local`.
//
// Pourquoi. La CLI Prisma ne lit que `.env`. Ce dépôt garde ses secrets dans
// `.env.local` (ignoré par git), comme tous les scripts `tsx` du package.json :
// `pnpm db:migrate:status` échouait donc en local sur
// « Environment variable not found: DIRECT_URL » (constaté le 13/10/2026),
// alors que CLAUDE.md la donne comme la commande à lancer.
//
// Les variables sont chargées par `tsx --env-file-if-exists=…` (voir
// package.json) ; ce fichier ne fait que transmettre l'environnement et les
// arguments à la vraie CLI. Sans `.env.local` (CI, Vercel), rien ne change :
// les variables viennent de l'hôte, comme avant.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cli = require.resolve('prisma/build/index.js');

const r = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(r.status ?? 1);
