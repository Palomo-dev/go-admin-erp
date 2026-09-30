/**
 * Lógica de `QuickAction` (Figma 759:21219) y `QuickActionsBar (CRM)`
 * (759:21433). Sin React.
 *
 * Regla del diseño: una acción deshabilitada lleva **siempre** su motivo
 * visible. Completa a `shared/quickActionsConfig.ts` (que sigue usando la barra
 * viva) con lo que el Figma pide y allí faltaba: Llamar se deshabilita sin
 * teléfono, con un número que no es de ningún país reconocible o con
 * `customers.do_not_call`; WhatsApp sin canal conectado; y «sin permiso»
 * (resuelto en el servidor, llega como booleano).
 */
import { normalizePhone, type QuickActionKind } from '@/components/crm/shared/quickActionsConfig';

export type AccionRapidaCrm = 'llamar' | 'email' | 'whatsapp' | 'reunion' | 'tarea' | 'nota';

/** Orden de `quickActionsConfig` (ALL_QUICK_ACTIONS), el mismo en los 5 lugares. */
export const ACCIONES_RAPIDAS: readonly AccionRapidaCrm[] = ['llamar', 'email', 'whatsapp', 'reunion', 'tarea', 'nota'];

/** Puente con la barra viva y sus diálogos (`QuickActionKind`). */
export const KIND_DE_ACCION: Record<AccionRapidaCrm, QuickActionKind> = {
  llamar: 'call',
  email: 'email',
  whatsapp: 'whatsapp',
  reunion: 'meeting',
  tarea: 'task',
  nota: 'note',
};

export type MotivoAccionDeshabilitada =
  | 'sinDestino'
  | 'sinPermiso'
  | 'sinTelefono'
  | 'telefonoInvalido'
  | 'noLlamar'
  | 'sinCorreo'
  | 'sinCanal';

export interface ContextoAccionesRapidas {
  /** Datos de `customers` que deciden la acción. */
  cliente?: { phone?: string | null; email?: string | null; do_not_call?: boolean | null } | null;
  /** Hay oportunidad o cliente al que colgar la acción. */
  tieneDestino: boolean;
  /** Indicativo de la organización (`useOrgDefaultCountry`); sin él, el de último recurso. */
  paisPorDefecto?: string;
  /** false = la organización no tiene canal de WhatsApp conectado. `undefined` = no se sabe (no bloquea). */
  canalWhatsApp?: boolean;
  /** Permiso resuelto en el servidor; `false` deshabilita con «Sin permiso». */
  permisos?: Partial<Record<AccionRapidaCrm, boolean>>;
}

export interface EstadoAccionRapida {
  accion: AccionRapidaCrm;
  habilitada: boolean;
  motivo?: MotivoAccionDeshabilitada;
}

function motivoTelefono(ctx: ContextoAccionesRapidas): MotivoAccionDeshabilitada | undefined {
  const crudo = ctx.cliente?.phone?.trim();
  if (!crudo) return 'sinTelefono';
  const e164 = normalizePhone(crudo, ctx.paisPorDefecto);
  // E.164: de 8 a 15 dígitos con el indicativo. «123» no es un número marcable.
  const digitos = e164?.replace(/\D/g, '').length ?? 0;
  return digitos >= 8 && digitos <= 15 ? undefined : 'telefonoInvalido';
}

export function motivoAccion(accion: AccionRapidaCrm, ctx: ContextoAccionesRapidas): MotivoAccionDeshabilitada | undefined {
  if (!ctx.tieneDestino) return 'sinDestino';
  if (ctx.permisos?.[accion] === false) return 'sinPermiso';
  switch (accion) {
    case 'llamar':
      return ctx.cliente?.do_not_call ? 'noLlamar' : motivoTelefono(ctx);
    case 'whatsapp':
      return motivoTelefono(ctx) ?? (ctx.canalWhatsApp === false ? 'sinCanal' : undefined);
    case 'email':
      return ctx.cliente?.email?.trim() ? undefined : 'sinCorreo';
    default:
      return undefined;
  }
}

export function estadoAccionesRapidas(
  ctx: ContextoAccionesRapidas,
  acciones: readonly AccionRapidaCrm[] = ACCIONES_RAPIDAS,
): EstadoAccionRapida[] {
  return acciones.map((accion) => {
    const motivo = motivoAccion(accion, ctx);
    return motivo ? { accion, habilitada: false, motivo } : { accion, habilitada: true };
  });
}

/** Variantes de la barra (Figma `Variant`). */
export type VarianteBarraAcciones = 'tarjeta' | 'drawer' | 'detalle' | 'cliente' | 'tarjetaMovil';

/** Solo íconos en la tarjeta (escritorio y móvil); botones con texto en el resto. */
export function formatoDeVariante(variante: VarianteBarraAcciones): 'boton' | 'icono' {
  return variante === 'tarjeta' || variante === 'tarjetaMovil' ? 'icono' : 'boton';
}

/** Botón extra al final: «Propuesta» en el detalle, «Nueva oportunidad» en la ficha del cliente. */
export function accionExtraDeVariante(variante: VarianteBarraAcciones): 'propuesta' | 'nuevaOportunidad' | null {
  if (variante === 'detalle') return 'propuesta';
  if (variante === 'cliente') return 'nuevaOportunidad';
  return null;
}

/** Índice al que va el foco con las flechas dentro de la barra (roving). */
export function indiceConTecla(tecla: string, actual: number, total: number): number | null {
  if (total <= 0) return null;
  switch (tecla) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (actual + 1) % total;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (actual - 1 + total) % total;
    case 'Home':
      return 0;
    case 'End':
      return total - 1;
    default:
      return null;
  }
}
