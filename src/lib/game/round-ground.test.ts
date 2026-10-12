import { describe, expect, it } from 'vitest';
import { chromeForRound, groundChrome, groundForRound } from './round-ground';

describe('groundForRound', () => {
  it('puts the Scénarios round on the light ground, as the canvas draws it', () => {
    expect(groundForRound('SCENARIO')).toBe('light');
  });

  it('leaves the other two rounds on the app ground', () => {
    expect(groundForRound('MIROIR')).toBe('dark');
    expect(groundForRound('FACEAFACE')).toBe('dark');
  });

  it('falls back to the app ground for anything unrecognised', () => {
    // Deliberately NOT null: an unknown round type should render like the
    // rest of the product, not like a broken screen.
    expect(groundForRound('')).toBe('dark');
    expect(groundForRound('SCENARIOS')).toBe('dark');
  });
});

describe('groundChrome', () => {
  it('sends each ground to the matching page background', () => {
    expect(groundChrome('dark').layout).toBe('ink');
    expect(groundChrome('light').layout).toBe('cream');
  });

  it('never reuses a dark-ground colour on the light ground', () => {
    // The failure this guards is specific: a class carried over from the
    // dark set paints cream text on a cream page — invisible, and
    // invisible in review too, because each individual class looks fine.
    const dark = groundChrome('dark');
    const light = groundChrome('light');
    for (const key of Object.keys(dark) as (keyof typeof dark)[]) {
      if (key === 'layout' || key === 'ctaVariant' || key === 'secondaryVariant') continue;
      expect(light[key], `${key} was copied from the dark ground`).not.toBe(dark[key]);
    }
  });

  it('gives the light ground no cream-on-cream text and the dark ground no plum-on-ink text', () => {
    // Entries that paint their OWN background are exempt, and the
    // exemption is the rule rather than a loophole: cream text on a wine
    // chip is legible wherever the chip is placed. What this catches is
    // text handed straight to the page's own ground in that ground's own
    // colour — invisible, and invisible in review too.
    const paintsOwnBackground = (value: string) => /\bbg-/.test(value);

    for (const [key, value] of Object.entries(groundChrome('light'))) {
      if (typeof value !== 'string' || paintsOwnBackground(value)) continue;
      expect(value, `${key} paints cream on cream`).not.toMatch(/\btext-cream\b/);
    }
    for (const [key, value] of Object.entries(groundChrome('dark'))) {
      if (typeof value !== 'string' || paintsOwnBackground(value)) continue;
      expect(value, `${key} paints plum on ink`).not.toMatch(/\btext-plum-deep\b/);
    }
  });

  it('picks a call-to-action that reads on its own ground', () => {
    expect(groundChrome('dark').ctaVariant).toBe('primary');
    expect(groundChrome('light').ctaVariant).toBe('inverse');
  });

  it('names a secondary variant too, rather than leaving a caller to patch classes', () => {
    expect(groundChrome('dark').secondaryVariant).toBe('secondary');
    expect(groundChrome('light').secondaryVariant).toBe('secondary-inverse');
  });
});

describe('chromeForRound', () => {
  it('is the composition of the two', () => {
    expect(chromeForRound('SCENARIO')).toEqual(groundChrome('light'));
    expect(chromeForRound('MIROIR')).toEqual(groundChrome('dark'));
  });
});
