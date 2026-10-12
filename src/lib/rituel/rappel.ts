// Le rappel doux — quand écrire à un couple qui ne vient plus, et quoi lui dire.
//
// UN SEUL MAIL PAR ABSENCE. La clé de déduplication porte le dernier jour
// d'activité : tant que le couple ne revient pas, elle ne change pas, donc
// `createNotification` refuse le second envoi (P2002). Dès qu'il revient puis
// s'absente de nouveau, la clé change et un nouveau rappel devient possible.
// Pas de relance en rafale : un produit qui harcèle se fait désinstaller, et
// un couple qu'on culpabilise ne revient pas jouer à deux.
//
// UNE FENÊTRE. Pas avant deux jours (un seul soir sans jouer n'est pas une
// absence), pas après quatorze (au-delà, un mail de plus est du bruit, et le
// couple a peut-être une bonne raison d'être ailleurs).
//
// Désactivable par chacun dans les Réglages : l'événement `RAPPEL_COUPLE` suit
// la règle des préférences de ce dépôt — activé tant qu'on ne l'a pas coupé.

import { ecartEnJours } from './jour';

export const TYPE_RAPPEL = 'RAPPEL_COUPLE';
export const ABSENCE_MIN_JOURS = 2;
export const ABSENCE_MAX_JOURS = 14;

export function doitRelancer(dernierJourActif: string, aujourdhui: string): boolean {
  const ecart = ecartEnJours(dernierJourActif, aujourdhui);
  return ecart >= ABSENCE_MIN_JOURS && ecart <= ABSENCE_MAX_JOURS;
}

/** Déterministe : la même absence rend toujours la même clé. */
export function cleRappel(userId: string, dernierJourActif: string): string {
  return `rappel-couple:${userId}:${dernierJourActif}`;
}

function echapper(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface MailRappel {
  subject: string;
  html: string;
  text: string;
}

/**
 * Le mail. Il nomme le partenaire quand on le connaît, parce que c'est lui —
 * pas l'application — qui donne envie de revenir. Le prénom vient de la base,
 * donc il est échappé dans la version HTML.
 */
export function mailRappel(args: {
  prenom: string | null;
  partenaire: string | null;
  serieRecord: number;
  origine: string;
}): MailRappel {
  const bonjour = args.prenom ? `Bonjour ${args.prenom},` : 'Bonjour,';
  const avec = args.partenaire ? `avec ${args.partenaire}` : 'à deux';
  const record =
    args.serieRecord >= 2
      ? `Votre plus belle série : ${args.serieRecord} jours d’affilée. De quoi vous donner envie de la battre ?`
      : 'Une minute suffit pour reprendre le fil.';
  const lien = `${args.origine.replace(/\/+$/, '')}/rituel`;

  return {
    subject: 'Une question vous attend ce soir',
    text:
      `${bonjour}\n\n` +
      `Votre question du jour vous attend, ${avec}. Une minute, deux réponses, ` +
      `et vous saurez si vous vous devinez encore.\n\n${record}\n\n${lien}\n\n` +
      `Vous pouvez couper ces rappels dans vos Réglages.`,
    html:
      `<p>${echapper(bonjour)}</p>` +
      `<p>Votre question du jour vous attend, ${echapper(avec)}. Une minute, deux réponses, ` +
      `et vous saurez si vous vous devinez encore.</p>` +
      `<p>${echapper(record)}</p>` +
      `<p><a href="${echapper(lien)}">Répondre à la question du jour</a></p>` +
      `<p style="color:#888;font-size:12px">Vous pouvez couper ces rappels dans vos Réglages.</p>`,
  };
}
