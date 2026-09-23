// ============================================================
// Observabilidad del fallback de zona horaria (fase A, punto 5).
//
// Hoy las organizaciones estan todas en America/Bogota, asi que cuando
// la resolucion de zona falla el fallback acierta por casualidad y nadie
// se entera. En cuanto entre una organizacion en Mexico, Madrid o
// Santiago ese silencio se convierte en fechas corridas.
//
// Por eso: cada vez que se cae al fallback SIN dato, se avisa con
// contexto (donde y de que organizacion). Una sola vez por clave, para
// no inundar la consola en un render que llama mil veces a lo mismo.
// ============================================================

import { DEFAULT_TIMEZONE, isUsableTimezone } from '@/lib/utils/dateCore';

/** Por que se cayo al fallback. */
export type MotivoFallbackZona =
  | 'sin-dato'   // no habia zona guardada
  | 'invalida'   // habia un valor, pero no es una zona IANA usable
  | 'error';     // la consulta fallo

export interface ContextoZonaHoraria {
  /** Donde ocurrio: nombre de la funcion, servicio o componente. */
  donde: string;
  organizationId?: number | null;
  branchId?: number | null;
  motivo?: MotivoFallbackZona;
  /** Valor que se rechazo, si lo habia (se registra recortado). */
  valor?: unknown;
}

/** Claves ya avisadas en este proceso/pestania. */
const avisados = new Set<string>();

function clave(ctx: ContextoZonaHoraria): string {
  const org = ctx.organizationId ?? '-';
  const sucursal = ctx.branchId ?? '-';
  return `${ctx.donde}|${org}|${sucursal}|${ctx.motivo ?? 'sin-dato'}`;
}

function describir(ctx: ContextoZonaHoraria): string {
  const trozos = [`donde=${ctx.donde}`, `motivo=${ctx.motivo ?? 'sin-dato'}`];
  if (ctx.organizationId != null) trozos.push(`organizacion=${ctx.organizationId}`);
  if (ctx.branchId != null) trozos.push(`sucursal=${ctx.branchId}`);
  if (ctx.valor !== undefined) trozos.push(`valor=${String(ctx.valor).slice(0, 64)}`);
  return trozos.join(' ');
}

/**
 * Deja rastro en Sentry si el SDK esta cargado. Import dinamico y solo
 * en navegador: en servidor (route handlers, jobs) no hay cliente de
 * Sentry y no debe romperse nada por intentarlo.
 */
function migaDeSentry(ctx: ContextoZonaHoraria): void {
  if (typeof window === 'undefined') return;
  try {
    void import('@sentry/react')
      .then((sentry) => {
        const agregar = (sentry as { addBreadcrumb?: (m: unknown) => void }).addBreadcrumb;
        if (typeof agregar !== 'function') return;
        agregar({
          category: 'timezone',
          level: 'warning',
          message: `zona horaria: fallback a ${DEFAULT_TIMEZONE}`,
          data: {
            donde: ctx.donde,
            motivo: ctx.motivo ?? 'sin-dato',
            organization_id: ctx.organizationId ?? null,
            branch_id: ctx.branchId ?? null,
          },
        });
      })
      .catch(() => {
        /* sin Sentry: el console.warn ya dejo el rastro */
      });
  } catch {
    /* entornos sin import dinamico */
  }
}

/**
 * Avisa de que se uso la zona por defecto porque no habia dato.
 * Una sola vez por combinacion donde+organizacion+sucursal+motivo.
 *
 * @returns true si este aviso se emitio, false si ya estaba avisado
 */
export function avisarFallbackZonaHoraria(ctx: ContextoZonaHoraria): boolean {
  const k = clave(ctx);
  if (avisados.has(k)) return false;
  avisados.add(k);
  console.warn(
    `[timezone] Sin zona horaria configurada: se usa el fallback ` +
      `'${DEFAULT_TIMEZONE}'. ${describir(ctx)}`,
  );
  migaDeSentry(ctx);
  return true;
}

/**
 * Resuelve la zona horaria a usar. Si `timezone` trae una zona valida se
 * devuelve tal cual y NO se avisa de nada. Si no, se cae a
 * DEFAULT_TIMEZONE avisando una sola vez por clave.
 *
 * La validacion es laxa a proposito (que Intl la acepte): una fila vieja
 * con un alias historico debe seguir funcionando. Para VALIDAR lo que se
 * va a ESCRIBIR en la base esta `isSupportedTimeZone`.
 */
export function resolverZonaHoraria(timezone: unknown, ctx: ContextoZonaHoraria): string {
  if (typeof timezone === 'string' && timezone.trim().length > 0) {
    if (isUsableTimezone(timezone)) return timezone;
    avisarFallbackZonaHoraria({ ...ctx, motivo: 'invalida', valor: timezone });
    return DEFAULT_TIMEZONE;
  }
  avisarFallbackZonaHoraria({ ...ctx, motivo: ctx.motivo ?? 'sin-dato' });
  return DEFAULT_TIMEZONE;
}

/**
 * Avisa de lo que devolvio la cascada de `resolveTimezoneCascade`: cada valor
 * ilegible con motivo 'invalida' y, si nadie aporto zona, un 'sin-dato'.
 *
 * Es el enganche que ADR-002 (punto 5) dejo pendiente para quien cerrara A3:
 * la cascada ya calculaba `source` e `invalid[]`, pero el contexto de React
 * tenia su PROPIA politica de avisos (otro Set, otro texto, sin Sentry). Dos
 * politicas de aviso son dos sitios donde dejar de avisar.
 */
export function avisarResolucionZonaHoraria(
  resolucion: { source: string; invalid: readonly string[] },
  ctx: ContextoZonaHoraria,
): void {
  for (const valor of resolucion.invalid) {
    avisarFallbackZonaHoraria({ ...ctx, motivo: 'invalida', valor });
  }
  if (resolucion.source === 'fallback' && resolucion.invalid.length === 0) {
    avisarFallbackZonaHoraria({ ...ctx, motivo: 'sin-dato' });
  }
}

/** Solo para tests: olvida que claves ya se avisaron. */
export function reiniciarAvisosZonaHoraria(): void {
  avisados.clear();
}
