/**
 * Archivos de un envío para quien lo recibe con su propia sesión: cada
 * miembro en el cron, o quien pide la prueba.
 */
import { OrgContextError } from '@/lib/utils/orgContextError';
import type { IdiomaDocumento } from '@/lib/documents/tipos';
import { resolverAccesoReportes, type SujetoReportes } from '../acceso.server';
import { getReporteById } from '../reportesCatalogo';
import { archivosDelEnvio, nombreSeguro, nombreSucursal, type ArchivosEnvio, type EnvioAArmar } from './envio.server';

/** Sucursales por destinatario cuando el envío es de todas y la persona solo ve algunas. */
export const MAX_SUCURSALES_POR_DESTINATARIO = 5;

/**
 * Si el envío es de todas las sucursales y la persona no tiene acceso a
 * todas, recibe un archivo por cada sucursal que sí ve: el
 * consolidado exige acceso total. Un reporte de toda la organización sigue
 * exigiéndolo: `archivosDelEnvio` lanza y el cron lo pausa para esa persona.
 */
export async function archivosParaMiembro(sesion: SujetoReportes, envio: EnvioAArmar, idioma: IdiomaDocumento): Promise<ArchivosEnvio> {
  const pedido = envio.branchId === null ? getReporteById(envio.reportId) : undefined;
  const def = pedido?.alias ? getReporteById(pedido.alias.destino) : pedido;
  if (!def || def.alcance === 'organizacion') return archivosDelEnvio(sesion, envio, idioma);
  const { alcance } = await resolverAccesoReportes(sesion);
  if (alcance.accesoTotal) return archivosDelEnvio(sesion, envio, idioma);
  if (alcance.permitidas.length === 0 || alcance.permitidas.length > MAX_SUCURSALES_POR_DESTINATARIO) {
    throw new OrgContextError('El consolidado requiere acceso a todas las sucursales', 403, 'BRANCH_SCOPE_REQUIRED');
  }
  const partes: Array<{ branchId: number; archivos: ArchivosEnvio }> = [];
  for (const branchId of alcance.permitidas) {
    partes.push({ branchId, archivos: await archivosDelEnvio(sesion, { ...envio, branchId }, idioma) });
  }
  if (partes.length === 1) return partes[0].archivos;
  const nombres = await Promise.all(partes.map((p) => nombreSucursal(sesion, p.branchId)));
  return {
    titulo: partes[0].archivos.titulo,
    adjuntos: partes.flatMap((p, i) => p.archivos.adjuntos.map((a) => ({ ...a, filename: `${nombreSeguro(nombres[i] ?? String(p.branchId))}_${a.filename}` }))),
  };
}
