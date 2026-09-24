/**
 * Permiso por tipo de documento, resuelto en el servidor (regla dura 6).
 *
 * `hasOrgAdminOrPermission`: super admin o rol 1/2, o el código por
 * `check_user_permission` (rol + cargo) con el usuario y la organización de la
 * SESIÓN. Basta uno de los códigos de la lista. Los reportes de caja deciden
 * dentro de su cargador (quien abrió la caja también puede), porque para eso
 * hay que leer la caja primero.
 */

import { hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';
import type { TipoDocumento } from '../tipos';
import type { SesionDocumento } from './base';

export const PERMISOS_POR_TIPO: Record<TipoDocumento, readonly string[] | 'caja'> = {
  'factura-venta': ['finance.view', 'pos.view'],
  'nota-credito': ['finance.view'],
  cotizacion: ['finance.view', 'sales_management'],
  'factura-compra': ['finance.view'],
  'documento-soporte': ['finance.view'],
  'estado-cuenta': ['finance.view'],
  'recibo-caja': ['finance.view', 'pos.view'],
  'comprobante-egreso': ['finance.view'],
  'cierre-caja': 'caja',
  'arqueo-caja': 'caja',
};

/** 403 `PERMISSION_REQUIRED` si el usuario de la sesión no tiene ninguno de los permisos del tipo. */
export async function autorizarTipo(sesion: SesionDocumento, tipo: TipoDocumento): Promise<void> {
  const requeridos = PERMISOS_POR_TIPO[tipo];
  if (requeridos === 'caja') return;
  for (const codigo of requeridos) {
    if (await hasOrgAdminOrPermission(sesion, codigo)) return;
  }
  console.warn('[documentos] permiso faltante → 403', {
    tipo,
    permisos: requeridos,
    organizationId: sesion.organizationId,
    userId: sesion.userId,
  });
  throw new OrgContextError(`Requiere el permiso ${requeridos.join(' o ')}`, 403, 'PERMISSION_REQUIRED');
}
