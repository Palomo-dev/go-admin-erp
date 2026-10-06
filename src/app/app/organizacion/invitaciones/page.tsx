'use client';

/**
 * Organización › Equipo › Invitaciones. La pantalla vive en
 * `src/components/organization/equipo/InvitacionesPantalla.tsx` (Figma 08).
 * `Suspense`: la pantalla lee `?invitar=1` con `useSearchParams`.
 */
import { Suspense } from 'react';
import { InvitacionesPantalla } from '@/components/organization/equipo/InvitacionesPantalla';

export default function InvitacionesPage() {
  return (
    <Suspense fallback={null}>
      <InvitacionesPantalla />
    </Suspense>
  );
}
