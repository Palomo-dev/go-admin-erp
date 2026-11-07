'use client';

/**
 * Integraciones › Conexiones (Frente INT, 2026-11-07; diseño 85-00, 01, 14 y 15).
 *
 * Sustituye la página anterior (catálogo + tabla con credenciales leídas desde el navegador,
 * «Probar» que fingía éxito e importación de conexiones por CSV). Lo que seguía sirviendo se
 * conserva en `ConexionesPagina`: el aviso de los callbacks OAuth (`?meta_success`, `?meta_error`
 * y sus equivalentes de TikTok y Google Ads) y la entrada a logística. Borrar una conexión pasa
 * al detalle («Zona de peligro»).
 */
import { Suspense } from 'react';
import { Skeleton } from '@/components/kit';
import { ConexionesPagina } from '@/components/integraciones/conexiones-v2/ConexionesPagina';

export default function ConexionesPage() {
  return (
    <Suspense fallback={<Skeleton className="m-4 h-64 sm:m-6" />}>
      <ConexionesPagina />
    </Suspense>
  );
}
