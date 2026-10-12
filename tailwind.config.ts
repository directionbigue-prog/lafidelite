import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#170D1B',
        cream: '#F6EEE6',
        gold: '#E8B860',
        'gold-deep': '#A9761F',
        wine: '#8B2C56',
        'wine-deep': '#6E2246',
        rose: '#F0A0C0',
        plum: {
          card: '#2A1730',
          card2: '#1E1024',
          DEFAULT: '#3A1B33',
          deep: '#241129',
          deep2: '#221028',
        },
        // Les deux teintes du damier, relevées dans le canevas de design.
        // Elles ne servent qu'au Salon et n'entrent pas dans la palette
        // générale du produit — d'où le préfixe.
        damier: {
          clair: '#EFE3D6',
          fonce: '#3D2036',
        },
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'serif'],
        grotesk: ['var(--font-grotesk)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
