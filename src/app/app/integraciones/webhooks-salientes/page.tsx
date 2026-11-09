import { redirect } from 'next/navigation';

/**
 * Los webhooks salientes viven desde 2026-11-09 en Integraciones › Conexiones › Desarrolladores
 * (crear, editar, duplicar, pausar, probar, nuevo secreto y borrar). Esta ruta queda solo para no
 * romper los enlaces viejos.
 */
export default function Page() {
  redirect('/app/integraciones/conexiones?tab=desarrolladores');
}
