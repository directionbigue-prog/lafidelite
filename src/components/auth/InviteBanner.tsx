// The "arrivée par invitation" card from the third artboard.
//
// Three states, because `GET /api/invites/:code` has three answers and each
// one changes what the visitor should expect — but none of them blocks
// signing up. An expired link is not a reason to refuse someone an account;
// it only means they will pair by code afterwards instead of automatically.
//
// The API deliberately returns only `creatorName`, never the creator's
// email, so an invite code cannot be used to fish for who owns it. Nothing
// here may render more than that name.
import { Alert } from '@/components/ui/Alert';

export type InviteState =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'valid'; creatorName: string | null }
  | { kind: 'invalid'; expired: boolean };

/** The name to greet, when the invite resolved and carried one. */
export function inviteCreatorName(state: InviteState): string | null {
  return state.kind === 'valid' ? state.creatorName : null;
}

export function InviteBanner({ state }: { state: InviteState }) {
  if (state.kind === 'none') return null;

  if (state.kind === 'loading') {
    return <Alert tone="info">Vérification de l’invitation…</Alert>;
  }

  if (state.kind === 'invalid') {
    return (
      <Alert tone="info">
        {state.expired
          ? 'Ce lien d’invitation a expiré. Créez votre compte : votre partenaire pourra vous renvoyer une invitation ensuite.'
          : 'Ce lien d’invitation n’est plus valide. Créez votre compte : vous pourrez rejoindre un Espace Couple avec un code.'}
      </Alert>
    );
  }

  const name = state.creatorName ?? 'Votre partenaire';
  return (
    <div className="rounded-2xl border border-rose/40 bg-plum-card p-5">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose" />
        <p className="text-sm leading-relaxed text-cream/85">
          <span className="font-semibold text-rose">{name}</span> vous invite à rejoindre votre
          Espace Couple. Créez votre compte : vous serez appariés automatiquement.
        </p>
      </div>
    </div>
  );
}
