// La carte « Inscription en 20 secondes » de la landing.
//
// ELLE MENTAIT, et pas qu'un peu. Sa légende annonçait « Pas de mot de passe.
// Vous recevez un code par SMS » : le produit n'a jamais eu ni SMS ni magic
// link. L'inscription réelle est email + mot de passe, puis un code de
// vérification à 8 caractères envoyé par EMAIL (`lib/server/auth.ts`,
// `POST /api/auth/verify-email`). Le champ demandait donc un numéro de
// téléphone que rien dans le code ne sait traiter.
//
// Corriger la phrase seule n'aurait pas suffi : le champ n'était relié à
// rien et le bouton était un `type="button"` sans gestionnaire. Une légende
// honnête au-dessus d'un formulaire mort reste un mensonge, simplement plus
// discret. Le formulaire MARCHE maintenant — un GET vers `/inscription`, donc
// l'adresse saisie ici arrive pré-remplie dans le vrai formulaire, qui lit
// `?email=` (voir `app/inscription/SignupForm.tsx`).
//
// Conséquence heureuse : plus aucun état. Les pastilles d'indicatif ne
// servaient qu'à composer un numéro, et disparaissent avec lui. Ce composant
// a donc cessé d'être client — la page d'accueil n'envoie plus une seule
// ligne de JavaScript au navigateur, et le module tampon qui n'existait
// que pour tenir la frontière du bundle a été supprimé avec elles.
//
// Ce qui reste du canevas : la mise en forme, au pixel près. Le bandeau, les
// bordures, les couleurs et l'alignement du bouton sont inchangés.

export function SignupCard({ ctaLabel }: { ctaLabel: string }) {
  return (
    <div
      id="inscription"
      style={{
        border: '1px solid rgba(246,238,230,.2)',
        background: '#1E1124',
        padding: '22px',
        marginBottom: '18px',
        maxWidth: '34em',
      }}
    >
      {' '}
      <div
        style={{
          fontSize: '12px',
          letterSpacing: '.16em',
          textTransform: 'uppercase',
          color: '#E8B860',
          marginBottom: '14px',
        }}
      >
        Inscription en 20 secondes
      </div>
      {/*
        Un GET, pas un POST : la soumission navigue vers /inscription en
        emportant l'email en query. Aucun JavaScript n'est requis, et la page
        de destination reste la seule à parler à l'API.
      */}
      <form
        action="/inscription"
        method="get"
        style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}
      >
        {' '}
        <div
          style={{
            display: 'flex',
            flex: '1',
            minWidth: '220px',
            border: '1px solid rgba(246,238,230,.24)',
            background: '#170D1B',
          }}
        >
          {' '}
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="vous@exemple.com"
            aria-label="Votre adresse email"
            style={{
              flex: '1',
              minWidth: '0',
              border: '0',
              outline: '0',
              background: 'transparent',
              color: '#F6EEE6',
              fontFamily: 'inherit',
              fontSize: '16px',
              padding: '15px 14px',
            }}
          />
        </div>
        <button
          type="submit"
          style={{
            border: '0',
            background: '#E8B860',
            color: '#170D1B',
            fontFamily: 'inherit',
            fontWeight: '700',
            fontSize: '16px',
            padding: '15px 26px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          className="cf-h2"
        >
          {ctaLabel}
        </button>
      </form>
      <div
        style={{
          fontSize: '14px',
          lineHeight: '1.5',
          color: 'rgba(246,238,230,.7)',
          marginTop: '14px',
        }}
      >
        Email et mot de passe. Vous recevez un code de vérification à 8 caractères, puis un lien à
        envoyer à votre partenaire.
      </div>
    </div>
  );
}
