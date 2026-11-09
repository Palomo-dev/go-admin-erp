import { redirect } from 'next/navigation';

/**
 * La bandeja de eventos vive desde 2026-11-09 en Integraciones › Conexiones › Actividad (filtros por
 * conexión, resultado, sentido y fechas; paginación; detalle con el cuerpo completo; CSV). Esta
 * ruta queda solo para no romper los enlaces viejos.
 */
export default function Page() {
  redirect('/app/integraciones/conexiones?tab=actividad');
}
