import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from './auth';

function makeReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/cron/test', { method: 'POST', headers });
}

describe('verifyCronSecret (CRON-06)', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'secret-value-12345');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 500 CRON_NOT_CONFIGURED when CRON_SECRET env is unset', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = verifyCronSecret(makeReq({ authorization: 'Bearer secret-value-12345' }));
    expect(res).toBeInstanceOf(NextResponse);
    expect(res!.status).toBe(500);
    expect((await res!.json()).error).toBe('CRON_NOT_CONFIGURED');
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = verifyCronSecret(makeReq());
    expect(res!.status).toBe(401);
    expect((await res!.json()).error).toBe('UNAUTHORIZED');
  });

  it('returns 401 when scheme is not Bearer (e.g. Basic)', async () => {
    const res = verifyCronSecret(makeReq({ authorization: 'Basic c29tZXVzZXI6cGFzcw==' }));
    expect(res!.status).toBe(401);
  });

  it('returns 401 when Bearer token is empty', async () => {
    const res = verifyCronSecret(makeReq({ authorization: 'Bearer ' }));
    expect(res!.status).toBe(401);
  });

  it('returns 401 when secret value is wrong', async () => {
    const res = verifyCronSecret(makeReq({ authorization: 'Bearer wrong-secret-value' }));
    expect(res!.status).toBe(401);
  });

  it('returns null on correct Bearer ${CRON_SECRET}', () => {
    const res = verifyCronSecret(makeReq({ authorization: 'Bearer secret-value-12345' }));
    expect(res).toBeNull();
  });

  it('returns 401 when token length differs from secret length (no timingSafeEqual throw)', () => {
    const res = verifyCronSecret(makeReq({ authorization: 'Bearer short' }));
    expect(res!.status).toBe(401);
  });

  it('accepts a CRON_SECRET set with a BOM or a trailing newline (PowerShell paste)', () => {
    // PUBLIC_URL carried exactly such a BOM in production on 2026-10-13.
    vi.stubEnv('CRON_SECRET', String.fromCharCode(0xfeff) + 'secret-value-12345\n');
    const res = verifyCronSecret(makeReq({ authorization: 'Bearer secret-value-12345' }));
    expect(res).toBeNull();
  });

  it('still refuses a wrong token once both sides are trimmed', () => {
    vi.stubEnv('CRON_SECRET', ' secret-value-12345 ');
    const res = verifyCronSecret(makeReq({ authorization: 'Bearer secret-value-1234X' }));
    expect(res!.status).toBe(401);
  });
});
