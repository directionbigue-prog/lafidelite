// La fin commune des pages de contenu : l'invitation à jouer, les packs, et
// les deux autres pages. Les liens croisés comptent pour le référencement
// autant que pour le visiteur — une page que rien ne cite est une page que
// les moteurs ne trouvent que par le sitemap.
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/Button';
import { PAGES_DE_CONTENU } from '@/lib/seo/contenus';

export function SuiteDeLecture({ ici }: { ici: string }) {
  const autres = PAGES_DE_CONTENU.filter((p) => p.chemin !== ici);
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-gold/30 bg-plum-card p-6">
      <div>
        <h2 className="font-serif text-2xl">Essayez à deux, ce soir</h2>
        <p className="mt-2 text-sm leading-relaxed text-cream/65">
          Créez votre Espace Couple : la première partie est offerte, sans carte. Votre partenaire
          vous rejoint avec un code à six chiffres, sans avoir à s’inscrire.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/inscription">Créer notre Espace Couple</ButtonLink>
        <ButtonLink href="/tarifs" variant="ghost">
          Voir les packs
        </ButtonLink>
      </div>
      <nav aria-label="À lire aussi" className="border-t border-cream/10 pt-4 text-sm">
        <p className="text-[11px] uppercase tracking-[0.16em] text-cream/50">À lire aussi</p>
        <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
          {autres.map((page) => (
            <li key={page.chemin}>
              <Link href={page.chemin} className="text-gold underline-offset-4 hover:underline">
                {page.lien}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
