import { redirect } from 'next/navigation';

/**
 * /app/organizacion → primera página del menú de Organización (Equipo ›
 * Miembros). Redirección en el servidor: antes era un `router.replace` en el
 * cliente que pintaba un esqueleto antes de saltar (auditoría 2026-10, P2-9).
 */
export default function OrganizacionPage() {
  redirect('/app/organizacion/miembros');
}
