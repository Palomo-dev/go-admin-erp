// ============================================================
// Cascada de zona horaria: sucursal → organización → fallback.
//
// Fase A3. Es el GEMELO EN CLIENTE de `fn_timezone_for(org, branch)` de la
// base de datos: mismas reglas, mismo orden, mismo fallback. Si las dos
// discrepan reaparece el bug de la ronda 2 (la sucursal se formatea con la
// zona de la organización). `branchTimezoneCascade.test.ts` compara ambas
// con los mismos datos dobles.
//
// Reglas (contrato compartido con la BD, leídas del cuerpo real de
// `fn_timezone_for` el 2026-09-23):
//   1. `branches.timezone` NULL / '' / solo espacios  → hereda.
//   2. Un valor presente pero NO reconocido **corta la cascada** y devuelve
//      DEFAULT_TIMEZONE. No se baja al siguiente nivel.
//   3. `organizations.timezone` sigue las mismas dos reglas.
//   4. Si nadie aporta zona: DEFAULT_TIMEZONE ('America/Bogota').
//
// La regla 2 es la que se corrigió al cerrar la fase A: este archivo bajaba
// al nivel siguiente («inválida en la sucursal → uso la de la organización»)
// mientras que `fn_timezone_for` devuelve el default, porque su paso 2 solo
// consulta la organización cuando la sucursal no aportó NADA:
//
//     if v_tz is null or btrim(v_tz) = '' then  -- una zona rota NO entra aquí
//     ...
//     begin v_prueba := (now() at time zone v_tz)::date;
//     exception when others then return 'America/Bogota'; end;
//
// Con sucursal='Marte/Olympus' y organización='Europe/Madrid' el cliente
// mostraba Madrid y la base escribía el día de Bogotá: el mismo dato con dos
// días distintos según quién lo calculara. Manda la base, que además es lo
// decidido y razonado en ADR-001 («un solo modo de fallo, reconocible»).
//
// Este módulo es puro (sin React, sin red) para poder probarlo en Jest con
// TZ=UTC y TZ=America/Bogota sin montar el árbol de componentes.
// ============================================================

import { DEFAULT_TIMEZONE, isUsableTimezone } from '@/lib/utils/dateCore';

export { isUsableTimezone };

/** De dónde salió la zona que se está aplicando. */
export type TimezoneSource = 'branch' | 'organization' | 'fallback';

export interface TimezoneResolution {
  /** Zona IANA efectiva, siempre un valor usable por Intl. */
  timezone: string;
  /** Nivel de la cascada que la aportó. */
  source: TimezoneSource;
  /** Valores descartados por no ser zonas válidas (para avisar). */
  invalid: string[];
}

/** Normaliza el valor guardado: '' y espacios cuentan como «hereda». */
function normalize(tz: string | null | undefined): string | null {
  if (typeof tz !== 'string') return null;
  const value = tz.trim();
  return value.length > 0 ? value : null;
}

export interface CascadeInput {
  /** Valor de `branches.timezone` del dato (null = hereda). */
  branchTimezone?: string | null;
  /** Valor de `organizations.timezone`. */
  organizationTimezone?: string | null;
  /** Último recurso; solo se cambia en tests. */
  fallback?: string;
}

/**
 * Resuelve la zona efectiva. Mismo orden y mismo fallback que la función
 * homónima de la base: sucursal → organización → 'America/Bogota'.
 *
 * Un valor presente pero ilegible NO se salta: corta la cascada y devuelve
 * el fallback, igual que `fn_timezone_for`. Ver la cabecera del archivo.
 */
export function resolveTimezoneCascade(input: CascadeInput): TimezoneResolution {
  const invalid: string[] = [];
  const fallback = input.fallback ?? DEFAULT_TIMEZONE;

  const levels: Array<{ value: string | null; source: TimezoneSource }> = [
    { value: normalize(input.branchTimezone), source: 'branch' },
    { value: normalize(input.organizationTimezone), source: 'organization' },
  ];

  for (const level of levels) {
    if (level.value === null) continue;
    if (isUsableTimezone(level.value)) {
      return { timezone: level.value, source: level.source, invalid };
    }
    // Zona rota: se para aquí. Bajar al nivel siguiente daría un día
    // distinto del que escribe la base (ver cabecera).
    invalid.push(level.value);
    return { timezone: fallback, source: 'fallback', invalid };
  }

  return { timezone: fallback, source: 'fallback', invalid };
}

/**
 * Igual que `resolveTimezoneCascade` pero partiendo del mapa de sucursales
 * que mantiene el contexto: `branchId` es el de LA FILA de datos, no el del
 * selector de la barra superior (ver OrganizationTimezoneContext).
 *
 * Un `branchId` desconocido (sucursal de otra organización, dato huérfano)
 * se trata como «sin override»: hereda de la organización.
 */
export function resolveTimezoneForBranch(
  branchId: number | null | undefined,
  branchTimezones: Readonly<Record<number, string | null>>,
  organizationTimezone: string | null | undefined,
  fallback?: string,
): TimezoneResolution {
  const override =
    typeof branchId === 'number' && Number.isFinite(branchId)
      ? branchTimezones[branchId] ?? null
      : null;
  return resolveTimezoneCascade({
    branchTimezone: override,
    organizationTimezone,
    fallback,
  });
}

/** Valor del `<option>` «Heredar de la organización». '' ⇢ NULL en la BD. */
export const INHERIT_TIMEZONE_VALUE = '';

export interface TimezoneOption {
  value: string;
  label: string;
}

/**
 * Opciones del selector de la ficha de sucursal. La PRIMERA es siempre
 * «heredar», y es la que corresponde a `timezone = NULL` (por defecto).
 * `sectionContract`-style: el test fija este orden.
 */
export function buildBranchTimezoneOptions(
  organizationTimezone: string,
  catalog: ReadonlyArray<TimezoneOption>,
): TimezoneOption[] {
  const inherit: TimezoneOption = {
    value: INHERIT_TIMEZONE_VALUE,
    label: `Heredar de la organización (${organizationTimezone})`,
  };
  return [inherit, ...catalog.filter((o) => o.value !== INHERIT_TIMEZONE_VALUE)];
}
