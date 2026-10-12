// The ambient ground every full-page shell sits on.
//
// Why it exists: on a phone the ink background is never really seen — the
// content fills the viewport edge to edge. On a 1500px-wide screen the same
// background becomes most of what you look at, and a flat #170D1B field
// makes a perfectly good layout read as unfinished. The landing page
// already solved this for itself with radial glows; this is the same idea
// made shareable, so the auth and game shells stop being the only screens
// where the web version looks emptier than the mobile one.
//
// Two separate elements rather than one multi-gradient class: Tailwind
// arbitrary values are string-substituted into CSS, and a single class
// holding two comma-separated `radial-gradient(...)` calls is exactly the
// kind of thing that silently fails to generate. One gradient per element
// is unambiguous.
//
// `pointer-events-none` + `aria-hidden` on both: this is decoration. It
// must never intercept a click meant for the form behind it, and it has
// nothing to announce.
export function AmbientBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Rose, upper-left — behind the brand panel, warming the gradient. */}
      <div className="absolute inset-0 bg-[radial-gradient(55%_45%_at_15%_10%,rgba(240,160,192,0.11),transparent_72%)]" />
      {/* Gold, lower-right — under the primary CTA, so the button reads as
          the warm point of the page rather than a lone bright object. */}
      <div className="absolute inset-0 bg-[radial-gradient(50%_45%_at_88%_92%,rgba(232,184,96,0.07),transparent_72%)]" />
    </div>
  );
}
