// La partie fictive que montre le téléphone de fin de partie, dans le héros
// de l'accueil, jouée par le VRAI moteur de score.
//
// Le canevas Claude Design du 16/10/2026 affichait « 297 » dans un anneau,
// sous le libellé d'un score total. Le jeu n'affiche nulle part un tel
// chiffre : l'écran de `/jeu/[id]/resultats` montre « Votre accord ce soir »,
// un GAIN signé, qui vaut les réponses communes du Face à face. Le canevas
// promettait aussi « +25 » par accord, et le moteur en compte 20.
//
// Plutôt que de recopier la formule (`alignmentPointsShared * 2` aujourd'hui,
// autre chose demain), on fait jouer à Aïssatou et Malick une manche de Face
// à face et on lit le résultat de `computeGameResult`. Si le barème change,
// l'accueil suit sans être retouché.
import { computeGameResult, type ScoredAnswer } from '@/lib/server/game/scoring';
import { complicityLevelLabel } from '@/lib/game/resultats';

/** Les réponses communes de la partie d'exemple, en Face à face. */
export const ACCORDS_EXEMPLE = 4;

/** Le score cumulé du couple fictif avant cette partie : il fixe son niveau. */
const CUMUL_AVANT_EXEMPLE = 120;

export interface PartieExemple {
  /** Le gain de la soirée, tel que l'écran de fin l'affiche (sans le « + »). */
  accord: number;
  /** Combien de réponses communes, sur combien de questions de Face à face. */
  accords: number;
  sur: number;
  /** Le niveau du couple, déjà traduit (« Complices »…). */
  niveau: string;
}

export function partieExemple(questionsFaceAFace: number): PartieExemple {
  const accords = Math.min(ACCORDS_EXEMPLE, questionsFaceAFace);
  const reponses: ScoredAnswer[] = [];
  for (let i = 0; i < questionsFaceAFace; i += 1) {
    const choixDeMalick = i < accords ? 'a' : 'b';
    for (const [userId, option] of [
      ['aissatou', 'a'],
      ['malick', choixDeMalick],
    ] as const) {
      reponses.push({
        questionId: `face-${i}`,
        roundType: 'FACEAFACE',
        userId,
        kind: 'OWN',
        selectedOptionId: option,
        isSkipped: false,
        effectiveElapsedMs: 12_000,
      });
    }
  }

  const resultat = computeGameResult({
    creatorId: 'aissatou',
    partnerId: 'malick',
    cumulativeCoupleScoreBeforeThisGame: CUMUL_AVANT_EXEMPLE,
    answers: reponses,
  });

  return {
    accord: resultat.coupleScore,
    accords,
    sur: questionsFaceAFace,
    niveau: complicityLevelLabel(resultat.complicityLevel),
  };
}
