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

/**
 * La préférence qui gouverne TOUS les mails du rituel — le rappel d'absence,
 * « à ton tour » et « flamme en danger ». Un seul interrupteur dans les
 * Réglages : trois cases pour trois variantes du même geste seraient trois
 * occasions de ne pas trouver celle qu'on cherche.
 */
export const TYPE_RAPPEL = 'RAPPEL_COUPLE';
export const TYPE_A_TON_TOUR = 'RITUEL_A_TON_TOUR';
export const TYPE_FLAMME = 'RITUEL_FLAMME_EN_DANGER';

/** Une seule relance « à ton tour » par partenaire et par jour. */
export function cleATonTour(userId: string, jour: string): string {
  return `rituel-a-ton-tour:${userId}:${jour}`;
}

/** Une seule alerte « flamme en danger » par partenaire et par jour. */
export function cleFlamme(userId: string, jour: string): string {
  return `rituel-flamme:${userId}:${jour}`;
}

/**
 * La flamme vaut-elle une alerte ce soir ? Seulement si elle existe vraiment
 * (deux jours au moins — prévenir qu'une série d'un jour va s'éteindre ne
 * protège rien) et si elle s'éteint pour de bon sans partie aujourd'hui.
 */
export function flammeAAlerter(s: {
  actuelle: number;
  joueAujourdhui: boolean;
  enDanger: boolean;
}): boolean {
  return s.actuelle >= 2 && !s.joueAujourdhui && s.enDanger;
}
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

function pied(lien: string, action: string): { html: string; text: string } {
  return {
    text: `\n\n${lien}\n\nVous pouvez couper ces emails dans vos Réglages.`,
    html:
      `<p><a href="${echapper(lien)}">${echapper(action)}</a></p>` +
      `<p style="color:#888;font-size:12px">Vous pouvez couper ces emails dans vos Réglages.</p>`,
  };
}

/**
 * « Awa a répondu » — le levier le plus fort du rituel, parce que c'est le
 * partenaire qui appelle, pas l'application. Ne dit JAMAIS ce qu'il a
 * répondu : la réponse se dévoile quand les deux ont joué, pas dans un mail.
 */
export function mailATonTour(args: {
  prenom: string | null;
  auteur: string | null;
  origine: string;
}): MailRappel {
  const bonjour = args.prenom ? `Bonjour ${args.prenom},` : 'Bonjour,';
  const qui = args.auteur ?? 'Votre partenaire';
  const corps = `${qui} vient de répondre à la question du jour, et a essayé de deviner votre réponse. À votre tour : les deux réponses se dévoilent dès que vous avez joué.`;
  const p = pied(`${args.origine.replace(/\/+$/, '')}/rituel`, 'Répondre à mon tour');
  return {
    subject: `${qui} a répondu — à votre tour !`,
    text: `${bonjour}\n\n${corps}${p.text}`,
    html: `<p>${echapper(bonjour)}</p><p>${echapper(corps)}</p>${p.html}`,
  };
}

/** « Votre flamme de 6 jours s'éteint ce soir. » */
export function mailFlamme(args: {
  prenom: string | null;
  partenaire: string | null;
  jours: number;
  origine: string;
}): MailRappel {
  const bonjour = args.prenom ? `Bonjour ${args.prenom},` : 'Bonjour,';
  const avec = args.partenaire ? ` avec ${args.partenaire}` : '';
  const corps =
    `Votre série de ${args.jours} jours${avec} s’éteint à minuit si vous ne jouez pas ensemble ce soir. ` +
    `Une question du jour à deux suffit à la garder allumée.`;
  const p = pied(`${args.origine.replace(/\/+$/, '')}/rituel`, 'Garder la flamme');
  return {
    subject: `Votre flamme de ${args.jours} jours vacille`,
    text: `${bonjour}\n\n${corps}${p.text}`,
    html: `<p>${echapper(bonjour)}</p><p>${echapper(corps)}</p>${p.html}`,
  };
}
