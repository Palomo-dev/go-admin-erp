'use client';

/**
 * Organización › Equipo › Roles y permisos (Figma «13. Equipo › Roles y
 * permisos»). La pantalla vive en `src/components/roles/`; las pestañas van en
 * la URL (`?vista=roles|cargos|comparar`), de ahí el Suspense.
 */
import { Suspense } from 'react';
import { PantallaRoles } from '@/components/roles/PantallaRoles';

export default function RolesPage() {
  return (
    <Suspense fallback={null}>
      <PantallaRoles />
    </Suspense>
  );
}
