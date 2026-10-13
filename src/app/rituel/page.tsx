'use client';

// /rituel — le rendez-vous quotidien du couple.
//
// Trois blocs, dans l'ordre où un couple les lit : la flamme (la série en
// cours), la question du jour (une minute, à deux), puis ce qu'ils ont
// construit (badges et souvenirs). Le jeu complet reste sur /jeu ; cet écran
// est la raison de revenir les soirs où il n'y a pas douze minutes devant soi.
//
// Toutes les décisions vivent dans `lib/rituel/*` — ce composant ne fait que
// les appeler et afficher ce qu'elles rendent (pas de jsdom dans ce dépôt).
//
// Le garde-fou du produit tient : les réponses ne se dévoilent que le jour
// même, une fois que les DEUX ont répondu, et le journal ne garde que des
// dates et des titres — jamais ce que l'un ou l'autre a choisi.
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { AppShell } from '@/components/app/AppShell';
import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';
import { gameErrorMessage } from '@/lib/game/api-result';
import type { EtatSerie } from '@/lib/rituel/serie';
import type { EtatBadge, Souvenir } from '@/lib/rituel/badges';
import type { Option, Revelation, Role } from '@/lib/rituel/question-du-jour';
import {
  autreRole,
  dateCourte,
  etapeQuestion,
  joursLibelle,
  legendeSerie,
  nomDe,
  compteARebours,
  msAvantProchaineQuestion,
  prochainObjectif,
  phraseObjectif,
} from '@/lib/rituel/ecran';

interface ProgressionResponse {
  aujourdhui: string;
  serie: EtatSerie;
  badges: EtatBadge[];
  souvenirs: Souvenir[];
}

interface QuestionResponse extends Revelation {
  jour: string;
  question: { id: string; prompt: string; options: Option[] };
  noms: Record<Role, string | null>;
  viewerRole: Role;
}

type Chargement<T> =
  | { kind: 'loading' }
  | { kind: 'ok'; data: T }
  | { kind: 'error'; message: string };

export default function RituelPage() {
  const user = useUser('/connexion');
  const [progression, setProgression] = useState<Chargement<ProgressionResponse>>({
    kind: 'loading',
  });
  const [question, setQuestion] = useState<Chargement<QuestionResponse>>({ kind: 'loading' });
  const [jeton, setJeton] = useState(0);

  const recharger = useCallback(() => setJeton((n) => n + 1), []);

  useEffect(() => {
    if (!user) return;
    let annule = false;
    // En parallèle : deux appels indépendants vers une base distante, l'un
    // ne doit pas attendre l'autre.
    api<ProgressionResponse>('/api/rituel')
      .then((data) => !annule && setProgression({ kind: 'ok', data }))
      .catch((err) => !annule && setProgression({ kind: 'error', message: gameErrorMessage(err) }));
    api<QuestionResponse>('/api/rituel/question-du-jour')
      .then((data) => !annule && setQuestion({ kind: 'ok', data }))
      .catch((err) => !annule && setQuestion({ kind: 'error', message: gameErrorMessage(err) }));
    return () => {
      annule = true;
    };
  }, [user, jeton]);

  if (!user) return null;

  return (
    <AppShell active="rituel">
      <div className="flex flex-col gap-8">
        <header>
          <p className="text-[11px] uppercase tracking-[0.16em] text-cream/50">Rituel du jour</p>
          <h1 className="mt-2 font-serif text-[clamp(30px,4.5vw,44px)] leading-[1.05]">
            Une minute, à deux.
          </h1>
        </header>

        {progression.kind === 'ok' && (
          <CarteSerie serie={progression.data.serie} badges={progression.data.badges} />
        )}

        {question.kind === 'loading' && (
          <p role="status" className="text-sm text-cream/60">
            Chargement…
          </p>
        )}
        {question.kind === 'error' && (
          <div className="flex flex-col items-start gap-4">
            <Alert tone="error">{question.message}</Alert>
            <Button onClick={recharger}>Réessayer</Button>
          </div>
        )}
        {question.kind === 'ok' && (
          <QuestionDuJour
            donnees={question.data}
            // Une réponse change la série et peut débloquer un badge : on
            // relit la progression avec la nouvelle question.
            onRepondu={(data) => {
              setQuestion({ kind: 'ok', data });
              api<ProgressionResponse>('/api/rituel')
                .then((p) => setProgression({ kind: 'ok', data: p }))
                .catch(() => undefined);
            }}
          />
        )}

        {progression.kind === 'error' && <Alert tone="error">{progression.message}</Alert>}
        {progression.kind === 'ok' && (
          <>
            <Badges badges={progression.data.badges} aujourdhui={progression.data.aujourdhui} />
            <Souvenirs souvenirs={progression.data.souvenirs} />
          </>
        )}
      </div>
    </AppShell>
  );
}

function CarteSerie({ serie, badges }: { serie: EtatSerie; badges: EtatBadge[] }) {
  // Le prochain badge à portée : chaque visite repart avec un « plus que N ».
  const objectif = prochainObjectif(badges, serie);
  return (
    <section className="flex items-center gap-5 rounded-3xl bg-gradient-to-br from-plum to-plum-deep2 p-6 sm:p-8">
      {/*
        La flamme est un dessin, pas un émoji : un émoji change de forme d'un
        téléphone à l'autre, et celui-ci est la marque de la série. Éteinte
        (cream/20) quand il n'y a pas de série — une flamme dorée à zéro jour
        dirait le contraire du chiffre à côté.
      */}
      <svg
        aria-hidden
        viewBox="0 0 24 32"
        className={`h-14 w-11 shrink-0 ${serie.actuelle > 0 ? (serie.enDanger ? 'text-rose' : 'text-gold') : 'text-cream/20'}`}
      >
        <path
          fill="currentColor"
          d="M12 1c1 5 7 8 7 16a7 7 0 0 1-14 0c0-4 2-6 3.5-8 .5 3 2 4 3.5 4.5C11 10 10 6 12 1Z"
        />
      </svg>
      <div>
        <p className="font-serif text-[clamp(34px,6vw,48px)] leading-none text-cream">
          {joursLibelle(serie.actuelle)}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-cream/60">{legendeSerie(serie)}</p>
        {objectif && (
          <p className="mt-1.5 text-sm font-semibold text-gold">{phraseObjectif(objectif)}</p>
        )}
      </div>
    </section>
  );
}

/**
 * « Prochaine question dans 5 h 12 » — l'attente devient un rendez-vous.
 * Rafraîchi chaque minute ; la page est rendue côté client seulement (elle
 * attend l'utilisateur), donc lire l'horloge ici ne crée pas d'écart
 * d'hydratation.
 */
function ProchaineQuestion() {
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setMaintenant(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <p className="text-sm text-cream/60">
      Parlez-en ce soir. Prochaine question dans{' '}
      <span className="font-semibold text-cream">
        {compteARebours(msAvantProchaineQuestion(maintenant))}
      </span>
      .
    </p>
  );
}

function QuestionDuJour({
  donnees,
  onRepondu,
}: {
  donnees: QuestionResponse;
  onRepondu: (d: QuestionResponse) => void;
}) {
  const [roleChoisi, setRoleChoisi] = useState<Role | null>(null);
  const [propre, setPropre] = useState<string | null>(null);
  const [devine, setDevine] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const etape = etapeQuestion(donnees, roleChoisi);
  const texte = (id: string) => donnees.question.options.find((o) => o.id === id)?.text ?? id;

  async function envoyer(role: Role) {
    if (!propre || !devine) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const data = await api<QuestionResponse>('/api/rituel/question-du-jour', {
        method: 'POST',
        body: { role, choixPropre: propre, choixDevine: devine },
      });
      setPropre(null);
      setDevine(null);
      onRepondu(data);
    } catch (err) {
      setErreur(gameErrorMessage(err));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section className="flex flex-col gap-5 rounded-3xl border border-cream/12 bg-plum-card p-6 sm:p-8">
      <div>
        <p className="text-[10px] uppercase tracking-[0.14em] text-gold">Question du jour</p>
        <h2 className="mt-3 font-serif text-[26px] leading-[1.2]">{donnees.question.prompt}</h2>
      </div>

      {etape.kind === 'choisir-qui' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-cream/60">
            Chacun répond pour soi, puis devine la réponse de l’autre. Qui tient le téléphone ?
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            {etape.restants.map((role) => (
              <Button key={role} variant="secondary" onClick={() => setRoleChoisi(role)}>
                C’est {nomDe(donnees.noms, role)}
              </Button>
            ))}
          </div>
        </div>
      )}

      {etape.kind === 'repondre' && (
        <div className="flex flex-col gap-5">
          <Choix
            titre={`${nomDe(donnees.noms, etape.role)}, votre réponse`}
            options={donnees.question.options}
            valeur={propre}
            onChange={setPropre}
            desactive={envoi}
          />
          <Choix
            titre={`Et selon vous, qu’a répondu ${nomDe(donnees.noms, autreRole(etape.role))} ?`}
            options={donnees.question.options}
            valeur={devine}
            onChange={setDevine}
            desactive={envoi}
          />
          {erreur && <Alert tone="error">{erreur}</Alert>}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button disabled={!propre || !devine || envoi} onClick={() => void envoyer(etape.role)}>
              {envoi ? 'Envoi…' : 'Valider mes réponses'}
            </Button>
            <Button variant="ghost" disabled={envoi} onClick={() => setRoleChoisi(null)}>
              Ce n’est pas moi
            </Button>
          </div>
        </div>
      )}

      {etape.kind === 'attente' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-cream/70">
            C’est noté. Les réponses se dévoilent quand {nomDe(donnees.noms, etape.manquant)} aura
            répondu à son tour : passez-lui le téléphone, ou laissez-le répondre depuis le sien. Si
            ses rappels sont activés, un email le prévient que c’est à son tour.
          </p>
          <div>
            <Button variant="secondary" onClick={() => setRoleChoisi(etape.manquant)}>
              C’est {nomDe(donnees.noms, etape.manquant)}, à moi
            </Button>
          </div>
        </div>
      )}

      {etape.kind === 'revele' && donnees.revele && (
        <div className="flex flex-col gap-4">
          {donnees.revele.telepathie && (
            <p className="rounded-2xl border border-gold/40 bg-plum-card2 px-4 py-3 text-sm font-semibold text-gold">
              Télépathes ! Vous vous êtes devinés l’un l’autre.
            </p>
          )}
          <ul className="grid gap-3 sm:grid-cols-2">
            {(['CREATOR', 'PARTNER'] as const).map((role) => {
              const r = donnees.revele![role];
              return (
                <li key={role} className="rounded-2xl border border-cream/12 bg-plum-card2 p-4">
                  <p className="text-sm font-semibold">{nomDe(donnees.noms, role)}</p>
                  <p className="mt-2 text-sm text-cream/70">
                    A répondu : <span className="text-cream">{texte(r.propre)}</span>
                  </p>
                  <p className="mt-1 text-sm text-cream/70">
                    A deviné : <span className="text-cream">{texte(r.devine)}</span>{' '}
                    <span className={r.devineJuste ? 'text-gold' : 'text-rose'}>
                      {r.devineJuste ? '— bien vu' : '— raté'}
                    </span>
                  </p>
                </li>
              );
            })}
          </ul>
          <ProchaineQuestion />
          <div>
            <ButtonLink href="/jeu" variant="secondary">
              Lancer une vraie partie
            </ButtonLink>
          </div>
        </div>
      )}
    </section>
  );
}

function Choix({
  titre,
  options,
  valeur,
  onChange,
  desactive,
}: {
  titre: string;
  options: Option[];
  valeur: string | null;
  onChange: (id: string) => void;
  desactive: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-2.5 text-sm font-semibold">{titre}</legend>
      {options.map((o) => {
        const choisi = o.id === valeur;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={choisi}
            disabled={desactive}
            onClick={() => onChange(o.id)}
            className={`flex w-full items-center justify-between gap-3 rounded-[18px] border px-4 py-3 text-left text-[15px] leading-snug transition-colors disabled:opacity-50 ${
              choisi
                ? 'border-gold bg-plum-card2 text-cream'
                : 'border-cream/16 text-cream/80 hover:border-cream/40'
            }`}
          >
            <span>{o.text}</span>
            {choisi && (
              <span aria-hidden className="shrink-0 font-bold text-gold">
                ✓
              </span>
            )}
          </button>
        );
      })}
    </fieldset>
  );
}

function Badges({ badges, aujourdhui }: { badges: EtatBadge[]; aujourdhui: string }) {
  const obtenus = badges.filter((b) => b.obtenuLe).length;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[10px] uppercase tracking-[0.14em] text-cream/50">
        Badges · {obtenus} sur {badges.length}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {badges.map((b) => {
          const obtenu = b.obtenuLe !== null;
          return (
            <li
              key={b.id}
              className={`rounded-2xl border p-4 ${obtenu ? 'border-gold/40 bg-plum-card' : 'border-cream/10 bg-plum-card/40'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p
                  className={`text-[15px] font-semibold ${obtenu ? 'text-gold' : 'text-cream/60'}`}
                >
                  {b.titre}
                </p>
                {b.obtenuLe === aujourdhui && (
                  <span className="shrink-0 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold uppercase text-ink">
                    Nouveau
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm leading-snug text-cream/60">{b.description}</p>
              {obtenu ? (
                <p className="mt-2 text-xs text-cream/50">Obtenu le {dateCourte(b.obtenuLe!)}</p>
              ) : (
                b.cible > 1 && (
                  <div className="mt-3">
                    {/* Largeur calculée à l'exécution : une classe Tailwind
                        ne peut pas l'exprimer (même choix que /jeu). */}
                    <div aria-hidden className="h-1 overflow-hidden rounded-full bg-cream/12">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-rose to-gold"
                        style={{ width: `${Math.round((b.valeur / b.cible) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-cream/50">
                      {b.valeur} / {b.cible}
                    </p>
                  </div>
                )
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Souvenirs({ souvenirs }: { souvenirs: Souvenir[] }) {
  if (souvenirs.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[10px] uppercase tracking-[0.14em] text-cream/50">Vos souvenirs</h2>
      <ol className="flex flex-col gap-0 border-l border-cream/12 pl-5">
        {souvenirs.map((s, i) => (
          <li key={`${s.jour}-${i}`} className="relative pb-5 last:pb-0">
            <span
              aria-hidden
              className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-gold"
            />
            <p className="text-xs text-cream/50">{dateCourte(s.jour)}</p>
            <p className="mt-0.5 text-[15px] font-semibold">{s.titre}</p>
            <p className="text-sm text-cream/60">{s.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
