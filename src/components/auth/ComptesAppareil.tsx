'use client';

// « Comptes sur cet appareil » — passer d'un compte à l'autre sans retaper de
// mot de passe, comme dans une messagerie.
//
// Deux usages :
//   - `reglages` : le compte actif, les autres, « Ajouter un compte » ;
//   - `connexion` : sur /connexion, les comptes déjà ouverts sur l'appareil,
//     en un clic. Rien ne s'affiche s'il n'y en a aucun.
//
// Le serveur décide de tout (api/auth/comptes) : chaque bascule y revérifie
// le jeton. Après une bascule, la page est rechargée en entier plutôt que
// mise à jour : le contexte d'authentification, le mode à distance et la partie en
// cours appartiennent au compte précédent, et rien ne doit en survivre.
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { coupleErrorMessage } from '@/lib/couples-error-messages';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

interface Compte {
  id: string;
  titre: string;
  sousTitre: string;
}

interface Etat {
  actuel: Compte | null;
  autres: Compte[];
  max: number;
}

export function ComptesAppareil({ mode }: { mode: 'reglages' | 'connexion' }) {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      setEtat(await api<Etat>('/api/auth/comptes'));
    } catch {
      setEtat({ actuel: null, autres: [], max: 5 });
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function agir(corps: Record<string, string>, cle: string, apres: () => void) {
    setEnCours(cle);
    setErreur(null);
    try {
      await api('/api/auth/comptes', { method: 'POST', body: corps });
      apres();
    } catch (e) {
      setErreur(
        e instanceof ApiError ? coupleErrorMessage(e.code, e.message) : 'Une erreur est survenue.',
      );
      setEnCours(null);
      void charger();
    }
  }

  const basculer = (id: string) =>
    agir({ action: 'basculer', userId: id }, id, () => window.location.assign('/jeu'));
  const retirer = (id: string) =>
    agir({ action: 'retirer', userId: id }, `retirer-${id}`, () => {
      setEnCours(null);
      void charger();
    });
  const ajouter = () =>
    agir({ action: 'ajouter' }, 'ajouter', () => window.location.assign('/connexion'));

  if (!etat) return null;
  if (mode === 'connexion' && etat.autres.length === 0) return null;

  if (mode === 'connexion') {
    return (
      <section className="flex flex-col gap-3 rounded-2xl border border-cream/14 bg-plum-card/50 p-4">
        <p className="text-[11px] uppercase tracking-[0.14em] text-cream/50">
          Comptes sur cet appareil
        </p>
        {erreur && <Alert tone="error">{erreur}</Alert>}
        {etat.autres.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3">
            <Identite compte={c} />
            <Button variant="ghost" onClick={() => void basculer(c.id)} disabled={enCours !== null}>
              {enCours === c.id ? 'Connexion…' : 'Continuer'}
            </Button>
          </div>
        ))}
      </section>
    );
  }

  const plein = etat.autres.length + (etat.actuel ? 1 : 0) >= etat.max;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-cream/16 bg-plum-card p-6">
      <div>
        <h2 className="font-serif text-xl">Comptes sur cet appareil</h2>
        <p className="mt-1 text-xs leading-relaxed text-cream/50">
          Passez d’un compte à l’autre sans retaper votre mot de passe. Jusqu’à {etat.max} comptes.
        </p>
      </div>

      {erreur && <Alert tone="error">{erreur}</Alert>}

      {etat.actuel && (
        <div className="flex items-center justify-between gap-3">
          <Identite compte={etat.actuel} />
          <span className="shrink-0 rounded-full border border-gold/40 bg-plum-card2 px-3 py-1 text-xs font-semibold text-gold">
            Actif
          </span>
        </div>
      )}

      {etat.autres.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center justify-between gap-3">
          <Identite compte={c} />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => void retirer(c.id)} disabled={enCours !== null}>
              {enCours === `retirer-${c.id}` ? 'Retrait…' : 'Retirer'}
            </Button>
            <Button onClick={() => void basculer(c.id)} disabled={enCours !== null}>
              {enCours === c.id ? 'Bascule…' : 'Utiliser'}
            </Button>
          </div>
        </div>
      ))}

      {etat.actuel && !plein && (
        <Button variant="ghost" onClick={() => void ajouter()} disabled={enCours !== null}>
          {enCours === 'ajouter' ? 'Un instant…' : 'Ajouter un autre compte'}
        </Button>
      )}
    </section>
  );
}

function Identite({ compte }: { compte: Compte }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate text-sm font-semibold">{compte.titre}</span>
      <span className="truncate text-xs text-cream/50">{compte.sousTitre}</span>
    </div>
  );
}
