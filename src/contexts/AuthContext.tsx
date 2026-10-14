'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, clearCsrfToken, storeCsrfToken } from '@/lib/api';
import { invalidateCachePrefix } from '@/lib/useApi';
import { COOKIE_PREFIX } from '@/lib/constants';

export interface User {
  id: string;
  email: string;
  name: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** false when the account was created via OAuth and never set a password. */
  hasPassword: boolean;
  /**
   * This account's own app-wide role, as the server reports it.
   *
   * For CHROME ONLY — deciding whether to offer a link to /admin. It is not a
   * permission: `/api/admin/*` re-checks every call through requireAdmin /
   * requireSuperadmin, so a value edited in the browser buys nothing. Never
   * branch on it to allow an action; branch on it only to avoid offering one
   * that would come back 403.
   *
   * Optional, and absent reads as 'USER': an older cached response or a
   * stubbed payload must never be mistaken for a privileged one.
   */
  role?: 'USER' | 'ADMIN' | 'SUPERADMIN';
  /** Provider names already linked, e.g. ['google']. Empty for pure email/password accounts. */
  linkedProviders: string[];
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  loggingOut: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ user: User; csrfToken?: string }>('/api/auth/me');
      setUser(res.user);
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
      } else if (err instanceof ApiError && err.status === 429) {
        setError('Too many requests. Wait a few minutes and try again.');
      } else {
        const msg =
          err instanceof Error
            ? err.message
            : 'Cannot reach the server. Check your network and try again.';
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Skip /me for anonymous visitors — the JS-readable CSRF cookie is only
    // set after login, so its absence is a reliable "no session" signal.
    const csrfCookieName = `${COOKIE_PREFIX}-csrf`;
    const hasCookie = document.cookie
      .split(';')
      .some((c) => c.trim().startsWith(`${csrfCookieName}=`));
    if (!hasCookie) {
      setLoading(false);
      return;
    }
    void fetchUser();
    // Run once on mount; fetchUser is stable.
  }, []);

  const logout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore — cookie will expire anyway
    }
    clearCsrfToken();
    invalidateCachePrefix('/api/');
    setUser(null);
    setLoggingOut(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loggingOut, error, refresh: fetchUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

const SSR_STUB: AuthContextValue = {
  user: null,
  loading: true,
  loggingOut: false,
  error: null,
  refresh: async () => {},
  logout: async () => {},
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    if (typeof window === 'undefined') return SSR_STUB;
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}

/**
 * Auth-required helper — returns the user, or redirects to the configured
 * login path if logged out. Use on pages that require an authenticated
 * session so each page doesn't reimplement the same `if (!user) router.push`.
 *
 *   export default function DashboardPage() {
 *     const user = useUser();         // never null inside the body
 *     if (!user) return null;         // null while redirecting / loading
 *     return <div>Hello {user.email}</div>;
 *   }
 *
 * Default redirect target is `/login`; override via the `redirectTo` arg.
 * Returns `null` while loading OR while the redirect is in flight, so the
 * UI can render a stub. Use the `loading` field of useAuth() if you want
 * to render a spinner explicitly.
 */
// The default is `/connexion`, this app's sign-in route. It used to be
// `/login` — the starter's name, kept after the fork renamed the page — so
// any caller that omitted the argument redirected unauthenticated visitors
// to a route that does not exist. `/settings` was doing exactly that: its
// sign-in redirect landed on a 404.
//
// `null` means "read the user, never redirect": for a public screen inside a
// shell that would otherwise send every visitor to /connexion. `/tarifs` was
// that screen — indexable, in the sitemap, with a signed-out purchase button —
// and `AppShell`'s bare `useUser()` bounced every anonymous visitor off it.
export function useUser(redirectTo: string | null = '/connexion'): User | null {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (redirectTo !== null && !loading && !user) {
      router.replace(redirectTo);
    }
  }, [loading, user, redirectTo, router]);

  if (loading || !user) return null;
  return user;
}
