import type { Metadata } from 'next';
import { Inter, Instrument_Serif, Familjen_Grotesk } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { VideoProvider } from '@/contexts/VideoContext';
import { FenetreVideo } from '@/components/video/FenetreVideo';
import { ORIGINE_CANONIQUE } from '@/lib/seo/pages';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

const familjenGrotesk = Familjen_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  // `metadataBase` est la pièce qui manquait : sans elle, Next rend les URL
  // d'Open Graph en RELATIF, et aucun réseau social ne sait alors où chercher
  // l'image. Le partage affichait donc une carte nue. Tout le reste —
  // canoniques, image, icônes — en dépend.
  metadataBase: new URL(ORIGINE_CANONIQUE),
  title: {
    default: 'Cœur Fidèle — le jeu de couple sur la fidélité',
    // Les pages enfants ne donnent que leur propre titre ; la marque est
    // ajoutée ici, une seule fois, pour qu'elle ne se répète jamais deux fois
    // dans un onglet.
    template: '%s · Cœur Fidèle',
  },
  description:
    'Cœur Fidèle est un jeu de couple en 15 questions. Trois manches, un téléphone qu’on se passe, un score commun.',
  applicationName: 'Cœur Fidèle',
  alternates: { canonical: '/' },
  // Par défaut : indexable. Chaque segment privé renverse ce réglage dans son
  // propre `layout.tsx`, ce qui est plus sûr que l'inverse — oublier de
  // déclarer une page publique la laisse indexable, oublier d'en interdire une
  // privée est rattrapé par le test d'exhaustivité.
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    siteName: 'Cœur Fidèle',
    url: '/',
    title: 'Cœur Fidèle — le jeu de couple sur la fidélité',
    description:
      'Un jeu à deux sur un seul téléphone. Trois manches, et un score commun — jamais l’un contre l’autre.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cœur Fidèle — le jeu de couple sur la fidélité',
    description:
      'Un jeu à deux sur un seul téléphone. Trois manches, et un score commun — jamais l’un contre l’autre.',
  },
  // `icon.svg` et `apple-icon.png` sont détectés par convention de fichier :
  // Next écrit les <link> lui-même, et les redéclarer ici les dupliquerait.
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${inter.variable} ${instrumentSerif.variable} ${familjenGrotesk.variable}`}
    >
      <body className={inter.className}>
        <ToastProvider>
          <AuthProvider>
            {/* Au-dessus des pages : l'appel survit aux changements d'écran. */}
            <VideoProvider>
              {children}
              <FenetreVideo />
            </VideoProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
