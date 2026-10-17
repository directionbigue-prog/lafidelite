// Les écrans de téléphone de l'accueil, repris du canevas Claude Design du
// 16/10/2026 avec leurs animations (voir `app/landing.css`, section
// « Animations »).
//
// Ce sont des ILLUSTRATIONS : Aïssatou et Malick n'existent pas, et les
// questions affichées sont écrites pour la maquette. Tout ce qui décrit le
// PRODUIT vient en revanche du code et non du canevas :
//   · le nom de chaque manche (`lib/game/round-labels.ts`) ;
//   · l'écran de fin, qui reprend celui de `/jeu/[id]/resultats` (« Votre
//     accord ce soir », un gain signé, le niveau du couple), calculé par le
//     vrai moteur dans `lib/landing/partie-exemple.ts`. Le canevas affichait
//     un total de 297 dans un anneau, chiffre que le jeu ne montre nulle part ;
//   · le Face à face, qui annonçait « +25 » par réponse commune. L'écran de
//     révélation ne montre jamais de points (`lib/game/round-reveal.ts`), et
//     le moteur n'en compte pas 25 : le téléphone dit donc « Même réponse ».
//   · l'attente à distance, qui reprend « X répond… » de `lib/distance/`.
//
// Chaque téléphone est une image pour les lecteurs d'écran (`role="img"` et
// une description) : sans cela, ils liraient une fausse partie au milieu de
// la page.
import type { CSSProperties, ReactNode } from 'react';
import { CompteurScore } from './CompteurScore';
import { roundLabelForType, type RoundType } from '@/lib/game/round-labels';
import { questionsPerRound } from '@/lib/game/formats';
import { partieExemple } from '@/lib/landing/partie-exemple';
import type { Jeu } from '@/lib/salon/jeux';

function nomDeManche(type: RoundType): string {
  const label = roundLabelForType(type);
  if (!label) throw new Error(`Manche sans libellé : ${type}`);
  return label.title;
}

/** L'en-tête d'un écran de jeu : la manche, la question, la progression. */
function EnTeteDeManche({
  numero,
  type,
  question,
  total,
}: {
  numero: number;
  type: RoundType;
  question: number;
  total: number;
}) {
  return (
    <>
      <div className="cf-ecran-entete">
        <span>
          Manche {numero} · {nomDeManche(type)}
        </span>
        <span>
          {question} / {total}
        </span>
      </div>
      <div className="cf-barre">
        <div style={{ width: `${Math.round((question / total) * 100)}%` }} />
      </div>
    </>
  );
}

function Telephone({
  description,
  className = '',
  ecran = '',
  style,
  children,
}: {
  description: string;
  className?: string;
  ecran?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className={`cf-tel ${className}`} style={style} role="img" aria-label={description}>
      <div className={`cf-ecran ${ecran}`}>
        <div className="cf-ilot" />
        {children}
      </div>
    </div>
  );
}

/** La coche dorée du canevas : réassurances du héros, réponses données. */
export function Coche({ taille = 16, epaisseur = 2.4 }: { taille?: number; epaisseur?: number }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={epaisseur}
      aria-hidden="true"
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

/** Héros, à gauche : une question de la manche Scénarios. */
export function TelephoneQuestion({ total }: { total: number }) {
  return (
    <Telephone
      description="Un téléphone pendant une partie : une question de la manche Scénarios, et quatre réponses possibles."
      className="cf-retard-1"
      style={{ transform: 'rotate(-5deg) translateX(24px)', zIndex: 1 }}
    >
      <EnTeteDeManche numero={2} type="SCENARIO" question={7} total={total} />
      <div className="cf-joueur" style={{ marginTop: 4 }}>
        <div className="cf-av cf-av-rose">A</div>
        <span>Au tour d’Aïssatou</span>
      </div>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--cf-discret)' }}>
        Mardi soir, 0 h 04. Un numéro inconnu : « Tu dors ? »
      </p>
      <p className="cf-question" style={{ fontSize: 19, lineHeight: 1.2 }}>
        Un message de ton ex à minuit. Tu fais quoi ?
      </p>
      <div className="cf-options">
        <div className="cf-opt">Je réponds, sans en parler</div>
        <div className="cf-opt cf-opt-choisie">Je montre le message</div>
        <div className="cf-opt">Je laisse sans répondre</div>
        <div className="cf-opt">Je bloque le numéro</div>
      </div>
    </Telephone>
  );
}

/** Héros, à droite : l'écran de fin, avec le gain qui s'additionne. */
export function TelephoneFin({ total }: { total: number }) {
  const faceAFace = questionsPerRound(total)[2] ?? 0;
  const partie = partieExemple(faceAFace);
  return (
    <Telephone
      description={`L’écran de fin de partie d’un couple : ${partie.accords} réponses communes sur ${partie.sur}, et leur niveau, ${partie.niveau}.`}
      className="cf-retard-3-5"
      ecran="cf-ecran-vif"
      style={{ transform: 'rotate(5deg) translateX(-24px) translateY(-40px)', zIndex: 2 }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          height: '100%',
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--cf-discret)', marginTop: 6 }}>
          Fin de partie
        </span>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
          <div
            className="cf-av cf-av-rose"
            style={{ width: 52, height: 52, fontSize: 18, border: '3px solid #351a33' }}
          >
            A
          </div>
          <div
            className="cf-av cf-av-bleu"
            style={{
              width: 52,
              height: 52,
              fontSize: 18,
              border: '3px solid #351a33',
              marginLeft: -12,
            }}
          >
            M
          </div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Aïssatou &amp; Malick</span>
        <div
          style={{
            position: 'relative',
            width: 150,
            height: 150,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 6,
          }}
        >
          <div className="cf-anneau" />
          <span className="cf-serif" style={{ fontSize: 44, fontWeight: 600, lineHeight: 1 }}>
            <CompteurScore cible={partie.accord} prefixe="+" />
          </span>
          <span style={{ fontSize: 10, color: 'var(--cf-discret)', marginTop: 4 }}>
            Votre accord ce soir
          </span>
        </div>
        <span
          className="cf-pastille"
          style={{ background: 'rgba(233,184,92,.16)', color: 'var(--cf-or-clair)', fontSize: 12 }}
        >
          Niveau {partie.niveau}
        </span>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: 'var(--cf-texte-doux)' }}>
          Vous étiez d’accord{' '}
          <strong style={{ color: 'var(--cf-or-clair)' }}>
            {partie.accords} fois sur {partie.sur}
          </strong>
          .
        </p>
        <div
          className="cf-lueur"
          style={{
            marginTop: 'auto',
            width: '100%',
            background: 'var(--cf-or)',
            color: 'var(--cf-encre)',
            borderRadius: 14,
            padding: 12,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          Rejouer
        </div>
      </div>
    </Telephone>
  );
}

/** Manche 1 : on devine l'autre, puis l'écran se masque pour passer le téléphone. */
export function TelephoneMiroir({ total }: { total: number }) {
  return (
    <Telephone description="La manche Miroir : Malick devine la réponse d’Aïssatou, puis l’écran se masque pour lui passer le téléphone.">
      <EnTeteDeManche numero={1} type="MIROIR" question={3} total={total} />
      <div className="cf-joueur">
        <div className="cf-av cf-av-bleu">M</div>
        <span>Malick devine Aïssatou</span>
      </div>
      <p className="cf-question">Qu’est-ce qui rendrait Aïssatou jalouse, d’après toi ?</p>
      <div className="cf-options">
        <div className="cf-opt">Un « like » sur une ancienne photo</div>
        <div className="cf-opt">Des messages effacés</div>
        <div className="cf-opt cf-opt-choisie">Un secret gardé pour soi</div>
        <div className="cf-opt">Rien, elle a confiance</div>
      </div>
      <div className="cf-note-ecran">L’écran se masque avant de passer le téléphone</div>
      <div className="cf-masque">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--cf-or)"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7c-.4 1-1.2 2.3-2.4 3.5M6.1 6.1C4 7.5 2.6 9.6 2 12c1 2.5 5 7 10 7c1.8 0 3.4-.5 4.8-1.3" />
        </svg>
        <span className="cf-serif" style={{ fontSize: 20, fontWeight: 600 }}>
          Écran masqué
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--cf-discret)', lineHeight: 1.5 }}>
          Passe le téléphone à Aïssatou
        </span>
        <div className="cf-av cf-av-rose" style={{ width: 48, height: 48, fontSize: 16 }}>
          A
        </div>
      </div>
    </Telephone>
  );
}

/** Manche 2 : une situation, chacun répond pour soi. */
export function TelephoneScenario({ total }: { total: number }) {
  return (
    <Telephone
      description="La manche Scénarios : une situation de la vie courante, et ce que chacun ferait."
      className="cf-retard-2"
      ecran="cf-ecran-vif"
    >
      <EnTeteDeManche numero={2} type="SCENARIO" question={8} total={total} />
      <div
        style={{
          borderRadius: 16,
          background: 'var(--cf-creux)',
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--cf-discret)' }}>Samedi, 22 h 30</span>
        <div
          className="cf-apparait"
          style={{
            alignSelf: 'flex-start',
            background: 'rgba(255,255,255,.1)',
            borderRadius: '12px 12px 12px 4px',
            padding: '8px 10px',
            fontSize: 12,
          }}
        >
          Ton collègue t’invite à un dîner « entre amis »… et il n’y aura que vous deux.
        </div>
      </div>
      <p className="cf-question" style={{ fontSize: 17 }}>
        Tu fais quoi ?
      </p>
      <div className="cf-options">
        <div className="cf-opt">J’y vais, sans le dire</div>
        <div className="cf-opt cf-opt-choisie">J’en parle d’abord</div>
        <div className="cf-opt">Je décline poliment</div>
      </div>
      <div
        className="cf-clignote"
        style={{
          marginTop: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          fontSize: 11,
          color: 'var(--cf-vert)',
        }}
      >
        <Coche taille={12} epaisseur={3} />
        Malick a déjà répondu
      </div>
    </Telephone>
  );
}

/** Manche 3 : les deux réponses côte à côte. */
export function TelephoneFaceAFace({ total }: { total: number }) {
  return (
    <Telephone
      description="La manche Face à face : les réponses d’Aïssatou et de Malick apparaissent côte à côte, et elles sont identiques."
      className="cf-retard-4"
    >
      <EnTeteDeManche numero={3} type="FACEAFACE" question={13} total={total} />
      <p className="cf-question">Partager ses mots de passe, c’est…</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          className="cf-glisse-gauche"
          style={{
            borderRadius: 14,
            padding: 12,
            background: 'rgba(232,122,139,.14)',
            border: '1px solid rgba(232,122,139,.5)',
          }}
        >
          <div className="cf-joueur" style={{ marginBottom: 6, color: 'var(--cf-texte)' }}>
            <div className="cf-av cf-av-rose" style={{ width: 24, height: 24, fontSize: 10 }}>
              A
            </div>
            <span style={{ fontSize: 11, fontWeight: 700 }}>Aïssatou</span>
          </div>
          <span style={{ fontSize: 12.5 }}>Une preuve de confiance</span>
        </div>
        <div
          className="cf-glisse-droite"
          style={{
            borderRadius: 14,
            padding: 12,
            background: 'rgba(143,179,232,.14)',
            border: '1px solid rgba(143,179,232,.5)',
          }}
        >
          <div className="cf-joueur" style={{ marginBottom: 6, color: 'var(--cf-texte)' }}>
            <div className="cf-av cf-av-bleu" style={{ width: 24, height: 24, fontSize: 10 }}>
              M
            </div>
            <span style={{ fontSize: 11, fontWeight: 700 }}>Malick</span>
          </div>
          <span style={{ fontSize: 12.5 }}>Une preuve de confiance</span>
        </div>
      </div>
      <div
        className="cf-surgit"
        style={{
          marginTop: 4,
          textAlign: 'center',
          borderRadius: 14,
          padding: 14,
          background: 'rgba(233,184,92,.14)',
        }}
      >
        <div className="cf-serif" style={{ fontSize: 24, fontWeight: 600, color: 'var(--cf-or)' }}>
          Même réponse
        </div>
        <div style={{ fontSize: 11, color: 'var(--cf-texte-doux)' }}>
          Un accord de plus pour votre couple.
        </div>
      </div>
    </Telephone>
  );
}

/** À distance : le téléphone qui joue, le trait d'union, le téléphone qui attend. */
export function TelephonesADistance({ total }: { total: number }) {
  return (
    <>
      <Telephone
        description="Le téléphone d’Aïssatou : c’est son tour, elle choisit sa réponse."
        className="cf-tel-moyen"
      >
        <div className="cf-joueur" style={{ marginTop: 8, color: 'var(--cf-texte)' }}>
          <div className="cf-av cf-av-rose">A</div>
          <span>Téléphone d’Aïssatou</span>
        </div>
        <span
          className="cf-pastille"
          style={{
            alignSelf: 'flex-start',
            background: 'rgba(143,211,168,.15)',
            color: 'var(--cf-vert)',
            fontSize: 11,
          }}
        >
          C’est ton tour
        </span>
        <p className="cf-question" style={{ fontSize: 17 }}>
          Ce qui te rassure le plus quand on est loin ?
        </p>
        <div className="cf-options">
          <div className="cf-opt cf-opt-choisie">Un appel avant de dormir</div>
          <div className="cf-opt">Des photos de ta journée</div>
          <div className="cf-opt">Savoir où tu sors</div>
        </div>
      </Telephone>
      <div className="cf-distance-lien" aria-hidden="true">
        <svg width="90" height="24" viewBox="0 0 90 24">
          <path
            className="cf-pointilles"
            d="M2 12h86"
            stroke="var(--cf-or)"
            strokeWidth="2"
            strokeDasharray="4 6"
            fill="none"
          />
          <circle className="cf-trajet" cx="45" cy="12" r="6" fill="var(--cf-or)" />
        </svg>
        <span>tour à tour</span>
      </div>
      <Telephone
        description="Le téléphone de Malick, pendant qu’Aïssatou répond : son écran suit la partie et attend son tour."
        className="cf-tel-moyen cf-retard-3"
        ecran="cf-ecran-vif"
      >
        <div className="cf-joueur" style={{ marginTop: 8, color: 'var(--cf-texte)' }}>
          <div className="cf-av cf-av-bleu">M</div>
          <span>Téléphone de Malick</span>
        </div>
        <span
          className="cf-pastille"
          style={{
            alignSelf: 'flex-start',
            background: 'rgba(255,255,255,.08)',
            color: 'var(--cf-discret)',
            fontSize: 11,
          }}
        >
          Aïssatou répond…
        </span>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            textAlign: 'center',
          }}
        >
          <div className="cf-points">
            <span />
            <span />
            <span />
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--cf-texte-doux)', lineHeight: 1.5 }}>
            Ton écran suit la partie.
            <br />
            Prépare ta réponse.
          </p>
          <div style={{ fontSize: 11, color: 'var(--cf-discret)' }}>Question 4 / {total}</div>
        </div>
      </Telephone>
    </>
  );
}

/** Le rituel : la flamme du couple et la question du jour. */
export function TelephoneRituel() {
  return (
    <Telephone
      description="Le rituel : la flamme du couple, à douze jours, et la question du jour à laquelle Aïssatou a déjà répondu."
      className="cf-tel-petit"
      style={{ margin: '0 auto' }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          textAlign: 'center',
        }}
      >
        <svg
          className="cf-flamme"
          width="56"
          height="64"
          viewBox="0 0 24 28"
          style={{ marginTop: 14 }}
          aria-hidden="true"
        >
          <path
            d="M12 1c1 5 7 7 7 15a7 7 0 0 1-14 0c0-4 2-6 3-8c0 3 1 4 2 4c0-5 2-8 2-11z"
            fill="var(--cf-or)"
          />
          <path
            d="M12 13c1 3 3 4 3 7a3 3 0 0 1-6 0c0-2 1-3 1.5-4c.3 1 .8 1.5 1.5 1.5c0-2 .5-3 0-4.5z"
            fill="var(--cf-rose)"
          />
        </svg>
        <div className="cf-serif" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1 }}>
          12 jours
        </div>
        <div style={{ fontSize: 11, color: 'var(--cf-discret)' }}>de flamme</div>
        <div
          style={{
            width: '100%',
            borderRadius: 14,
            background: 'rgba(255,255,255,.06)',
            padding: 12,
            fontSize: 12.5,
            lineHeight: 1.35,
            textAlign: 'left',
          }}
        >
          Question du jour : ton plus beau souvenir de nous deux ?
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span
            className="cf-pastille"
            style={{
              padding: '4px 9px',
              fontSize: 11,
              background: 'rgba(143,211,168,.15)',
              color: 'var(--cf-vert)',
            }}
          >
            A <Coche taille={10} epaisseur={3} />
          </span>
          <span
            className="cf-pastille cf-clignote"
            style={{
              padding: '4px 9px',
              fontSize: 11,
              background: 'rgba(255,255,255,.08)',
              color: 'var(--cf-discret)',
            }}
          >
            M en attente
          </span>
        </div>
      </div>
    </Telephone>
  );
}

/**
 * L'icône de chaque jeu du Salon. Un `Record<Jeu, …>` comme les noms
 * (`lib/salon/noms.ts`) : un sixième jeu sans icône est une erreur de typage.
 */
export const ICONES_DU_SALON: Readonly<Record<Jeu, ReactNode>> = {
  DAMES: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </>
  ),
  AWALE: (
    <>
      <rect x="2" y="7" width="20" height="10" rx="5" />
      <circle cx="7" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="17" cy="12" r="1.5" />
    </>
  ),
  LUDO: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <circle cx="9" cy="9" r="1.2" fill="var(--cf-or)" />
      <circle cx="15" cy="15" r="1.2" fill="var(--cf-or)" />
      <circle cx="15" cy="9" r="1.2" fill="var(--cf-or)" />
      <circle cx="9" cy="15" r="1.2" fill="var(--cf-or)" />
    </>
  ),
  MOT: <path d="M5 19L12 5l7 14M8 13h8" />,
  MOTS_CROISES: <path d="M4 4h6v6H4zM10 4h6v6h-6zM10 10h6v6h-6zM10 16h6v4h-6zM16 10h4v6h-4z" />,
};
