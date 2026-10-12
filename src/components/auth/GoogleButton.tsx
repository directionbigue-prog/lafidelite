// The "Continuer avec Google" button from the canvas.
//
// A plain <a>, not a fetch: `/api/auth/oauth/google/start` answers a 302 to
// Google, and the browser must follow it as a top-level navigation so the
// state and PKCE cookies it sets are stored. An XHR would swallow the
// redirect and the callback would then fail state validation.
//
// This component never decides whether Google is available — the page does,
// from `tryCreateGoogleProvider()` server-side. Rendering it when the
// provider is unconfigured would point users at a 404.
export function GoogleButton({ next }: { next: string }) {
  return (
    <a
      href={`/api/auth/oauth/google/start?next=${encodeURIComponent(next)}`}
      className="flex w-full items-center justify-center gap-3 rounded-full border border-cream/26 bg-cream px-6 py-3.5 text-[15px] font-semibold text-ink transition-colors hover:bg-rose"
    >
      <GoogleMark />
      Continuer avec Google
    </a>
  );
}

// Inlined rather than pulled from an icon package: this is the one icon on
// the screen, and Google's mark has fixed brand colours that a generic icon
// set would not reproduce correctly.
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="h-5 w-5">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.3-4.6 6.9l7.6 5.9c4.4-4.1 6.7-10.1 6.7-17.3z"
      />
      <path
        fill="#FBBC05"
        d="M10.4 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.8l7.8-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.2 0 11.5-2 15.4-5.6l-7.6-5.9c-2.1 1.4-4.8 2.3-7.8 2.3-6.3 0-11.7-3.7-13.6-8.9l-7.8 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}
