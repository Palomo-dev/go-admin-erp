'use client';

/**
 * /app/sitio-web/dominios — «Dominios» (Figma B/07-01…07-28). La dirección del
 * sitio en internet: subdominio gratis, dominios propios y comprados,
 * conectar (`?accion=conectar[&sede=<id>]`) y comprar (`?accion=comprar`).
 *
 * Toda la lógica vive en `src/components/sitio-web/dominios/` (hook único
 * `useDominiosSitio` sobre `/api/sitio-web/dominios`); la página solo la monta.
 * `Suspense` porque los diálogos se abren desde la URL (`useSearchParams`).
 */
import { Suspense } from 'react';
import { PantallaDominios } from '@/components/sitio-web/dominios/PantallaDominios';

export default function DominiosSitioWebPage() {
  return (
    <Suspense fallback={null}>
      <PantallaDominios />
    </Suspense>
  );
}
