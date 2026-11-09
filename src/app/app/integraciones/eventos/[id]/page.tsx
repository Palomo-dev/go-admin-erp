import { redirect } from 'next/navigation';

/**
 * El detalle de un evento se abre desde 2026-11-09 en Integraciones › Conexiones › Actividad
 * (`?evento=<id>`: panel con la explicación del error, el cuerpo completo, copiar id y descargar
 * JSON). Esta ruta queda solo para no romper los enlaces viejos.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/integraciones/conexiones?tab=actividad&evento=${encodeURIComponent(id)}`);
}
