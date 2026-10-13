'use client';

// /admin/tableau-de-bord — la vue d'ensemble du super-administrateur.
//
// Mince enveloppe : tout l'écran vit dans `components/admin/TableauDeBord`,
// compté comme surface par `surfaces-cablees.test.ts`. La route refait son
// propre contrôle SUPERADMIN ; cette page ne protège rien.
import { useUser } from '@/contexts/AuthContext';
import { AppShell } from '@/components/app/AppShell';
import { TableauDeBord } from '@/components/admin/TableauDeBord';

export default function TableauDeBordPage() {
  const utilisateur = useUser('/connexion');
  if (!utilisateur) return null;

  return (
    <AppShell active="administration" coupleLabel={null}>
      <TableauDeBord />
    </AppShell>
  );
}
