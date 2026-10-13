// L'appel réseau de la console d'administration.
//
// LE DÉFAUT QU'IL CORRIGE (constaté en production le 13/10/2026) : toute la
// console appelait `api('/admin/me')`, `api('/admin/users')`… en croyant que
// `api()` préfixait `/api` — un commentaire de `ListeAdmin.tsx` le disait. Il
// ne préfixe rien : `API_URL` vaut '' tant que NEXT_PUBLIC_API_URL n'est pas
// posé, donc le navigateur demandait la PAGE `/admin/me`, recevait un 404 en
// HTML, et la console affichait une erreur au lieu des comptes. Chaque route
// répondait correctement à `/api/admin/…` ; aucune n'était jamais atteinte.
//
// Les chemins restent écrits `/admin/…` (c'est ce que `surfaces-cablees.test`
// et les constructeurs de requête de `console.ts` manipulent) ; c'est la base
// qui porte `/api`. `api-admin.test.ts` interdit tout appel `api()` direct
// dans les écrans d'administration.
import { api } from '@/lib/api';
import { API_URL } from '@/lib/constants';

export const BASE_API_ADMIN = `${API_URL}/api`;

type Options = Omit<NonNullable<Parameters<typeof api>[1]>, 'baseUrl'>;

export function apiAdmin<T = unknown>(chemin: string, options: Options = {}): Promise<T> {
  return api<T>(chemin, { ...options, baseUrl: BASE_API_ADMIN });
}
