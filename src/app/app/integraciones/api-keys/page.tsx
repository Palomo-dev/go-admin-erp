import { redirect } from 'next/navigation';

/**
 * Las llaves de API viven desde 2026-11-09 en Integraciones › Conexiones › Desarrolladores
 * (crear, editar, duplicar, desactivar, revocar y borrar). Esta ruta queda solo para no romper los
 * enlaces viejos.
 */
export default function Page() {
  redirect('/app/integraciones/conexiones?tab=desarrolladores');
}
