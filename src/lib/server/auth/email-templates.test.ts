import { describe, it, expect } from 'vitest';
import { verificationEmail, resetPasswordEmail } from './email-templates';

describe('verificationEmail', () => {
  it('returns { subject, html, text } all non-empty', () => {
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com' });
    expect(t.subject).toBeTruthy();
    expect(t.html).toBeTruthy();
    expect(t.text).toBeTruthy();
  });

  it('embeds the code in both html and text', () => {
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com' });
    expect(t.html).toContain('ABCD2345');
    expect(t.text).toContain('ABCD2345');
  });

  it('subject matches expected', () => {
    const t = verificationEmail({ code: 'XYZ12345', email: 'x@y.com' });
    expect(t.subject).toBe('Votre code de vérification');
  });

  // The code used to end a sentence, so a selection in a mail client easily
  // carried the full stop and a code read off that line easily gained a
  // grouping space — both refused by the server's regex as
  // VALIDATION_FAILED. Nothing may sit against the code on either side.
  it('leaves the code alone on its line, with no punctuation touching it', () => {
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com' });
    expect(t.html).toContain('<strong>ABCD2345</strong></p>');
    expect(t.html).not.toContain('ABCD2345</strong>.');
    expect(t.text).toContain('\n\nABCD2345\n\n');
  });

  it('renders "dans N minutes" when expiresAt is provided (O1 audit fix)', () => {
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com', expiresAt });
    // floor-biased: with 15 min remaining the actual rendered value can be
    // 14 or 15 — either is acceptable.
    expect(t.text).toMatch(/dans 1[45] minutes/);
    expect(t.html).toMatch(/dans 1[45] minutes/);
  });

  it('renders "dans N heures" for multi-hour TTLs', () => {
    // +1 min buffer so the floor-biased rounding can't drop minutes to 119
    // (which would render "dans 1 heure" instead of "dans 2 heures" — a latent
    // flake fixed by audit pass 2).
    const expiresAt = new Date(Date.now() + 2 * 60 * 60_000 + 60_000).toISOString();
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com', expiresAt });
    expect(t.text).toContain('dans 2 heures');
  });

  it('falls back to "bientôt" when expiresAt is omitted', () => {
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com' });
    expect(t.text).toContain('expire bientôt');
  });

  it('falls back to "bientôt" when expiresAt is malformed', () => {
    const t = verificationEmail({
      code: 'ABCD2345',
      email: 'a@b.com',
      expiresAt: 'not-an-iso-date',
    });
    expect(t.text).toContain('expire bientôt');
  });

  it('falls back to "bientôt" when expiresAt is already in the past', () => {
    const expiresAt = new Date(Date.now() - 1000).toISOString();
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com', expiresAt });
    expect(t.text).toContain('expire bientôt');
  });
});

describe('resetPasswordEmail', () => {
  it('returns { subject, html, text } all non-empty', () => {
    const t = resetPasswordEmail({ code: 'WXYZ9876', email: 'a@b.com' });
    expect(t.subject).toBeTruthy();
    expect(t.html).toBeTruthy();
    expect(t.text).toBeTruthy();
  });

  it('embeds the code in both html and text', () => {
    const t = resetPasswordEmail({ code: 'WXYZ9876', email: 'a@b.com' });
    expect(t.html).toContain('WXYZ9876');
    expect(t.text).toContain('WXYZ9876');
  });

  it('subject matches expected', () => {
    const t = resetPasswordEmail({ code: 'ABCD2345', email: 'a@b.com' });
    expect(t.subject).toBe('Réinitialiser votre mot de passe');
  });

  it('leaves the code alone on its line, with no punctuation touching it', () => {
    const t = resetPasswordEmail({ code: 'WXYZ9876', email: 'a@b.com' });
    expect(t.html).toContain('<strong>WXYZ9876</strong></p>');
    expect(t.text).toContain('\n\nWXYZ9876\n\n');
  });

  it('renders "dans N minutes" when expiresAt is provided (O1 audit fix)', () => {
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const t = resetPasswordEmail({ code: 'WXYZ9876', email: 'a@b.com', expiresAt });
    expect(t.text).toMatch(/dans 1[45] minutes/);
  });
});
