/**
 * Reglas contables con cuentas inválidas: lo que la pantalla decide sin base de
 * datos. Módulo hoja, sin Supabase ni React.
 *
 * El bloqueo real es `trg_accounting_rules_validar_cuentas`
 * (20261107100000): esto solo evita viajar al servidor y traduce su respuesta.
 * El inventario y la propuesta salen de `fn_reglas_contables_diagnostico`.
 */
import { esCuentaDeTitulo, type CuentaParaTitulo } from '@/lib/finanzas/cuentasTitulo';

export const LADOS_REGLA = ['debito', 'credito', 'impuesto', 'descuento'] as const;
export type LadoRegla = (typeof LADOS_REGLA)[number];

export const CODIGOS_FALLO_CUENTA = ['cuenta_no_existe', 'cuenta_inactiva', 'cuenta_de_titulo'] as const;
export type CodigoFalloCuenta = (typeof CODIGOS_FALLO_CUENTA)[number];

export const CODIGOS_ERROR_REGLA = [
  ...CODIGOS_FALLO_CUENTA,
  'regla_otra_organizacion',
  'regla_no_encontrada',
  'datos_invalidos',
  'sin_permiso',
  'desconocido',
] as const;
export type CodigoErrorRegla = (typeof CODIGOS_ERROR_REGLA)[number];

/** Columna de `accounting_rules` de cada lado. */
export const COLUMNA_LADO: Record<LadoRegla, 'debit_account_code' | 'credit_account_code' | 'tax_account_code' | 'discount_account_code'> = {
  debito: 'debit_account_code',
  credito: 'credit_account_code',
  impuesto: 'tax_account_code',
  descuento: 'discount_account_code',
};

export interface CuentaDePlan extends CuentaParaTitulo {
  is_active?: boolean | null;
  es_movimiento?: boolean | null;
}

/** Mismo criterio que `fn_cuenta_fallo_en_regla`. */
export function falloCuentaEnRegla(codigo: string, plan: readonly CuentaDePlan[]): CodigoFalloCuenta | null {
  const limpio = codigo.trim();
  const cuenta = plan.find((fila) => fila.account_code === limpio);
  if (!limpio || !cuenta) return 'cuenta_no_existe';
  if (cuenta.is_active === false) return 'cuenta_inactiva';
  if (cuenta.es_movimiento === false || esCuentaDeTitulo(cuenta, plan)) return 'cuenta_de_titulo';
  return null;
}

export type ValoresRegla = Partial<Record<(typeof COLUMNA_LADO)[LadoRegla], string | null>>;

export interface CuentaBloqueada {
  lado: LadoRegla;
  cuenta: string;
  codigo: CodigoFalloCuenta;
}

/**
 * Primera cuenta que el servidor rechazaría. Igual que el disparador, solo mira
 * lo que cambia: una regla que ya venía mal se puede renombrar sin corregirla.
 */
export function cuentaBloqueada(
  nueva: ValoresRegla,
  anterior: ValoresRegla | null,
  plan: readonly CuentaDePlan[],
): CuentaBloqueada | null {
  for (const lado of LADOS_REGLA) {
    const columna = COLUMNA_LADO[lado];
    const valor = (nueva[columna] ?? '').trim();
    const opcional = lado === 'impuesto' || lado === 'descuento';
    if (!valor && opcional) continue;
    if (anterior && valor === (anterior[columna] ?? '').trim()) continue;
    const codigo = falloCuentaEnRegla(valor, plan);
    if (codigo) return { lado, cuenta: valor, codigo };
  }
  return null;
}

export function estadoHttpErrorRegla(codigo: CodigoErrorRegla): number {
  if (codigo === 'sin_permiso') return 403;
  if (codigo === 'regla_no_encontrada') return 404;
  if (codigo === 'desconocido') return 500;
  return 422;
}

const TEXTO_OBLIGATORIO = ['name', 'source_type', 'event_type', 'debit_account_code', 'credit_account_code'] as const;
const TEXTO_OPCIONAL = ['description', 'tax_account_code', 'discount_account_code'] as const;
const LARGO_MAXIMO = 500;

export type CamposRegla = Record<string, string | number | boolean | Record<string, unknown> | null>;

/**
 * Lista blanca de lo que un cliente puede escribir. `organization_id`, `id` y
 * las fechas nunca pasan: los fija el servidor. Devuelve `null` si algo no
 * cuadra. Al actualizar solo llegan los campos enviados.
 */
export function camposDeRegla(body: unknown, modo: 'crear' | 'actualizar'): CamposRegla | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const entrada = body as Record<string, unknown>;
  const campos: CamposRegla = {};

  for (const clave of TEXTO_OBLIGATORIO) {
    const valor = entrada[clave];
    if (valor === undefined) {
      if (modo === 'crear') return null;
      continue;
    }
    if (typeof valor !== 'string' || !valor.trim() || valor.length > LARGO_MAXIMO) return null;
    campos[clave] = valor.trim();
  }

  for (const clave of TEXTO_OPCIONAL) {
    const valor = entrada[clave];
    if (valor === undefined) continue;
    if (valor === null || valor === '') {
      campos[clave] = null;
      continue;
    }
    if (typeof valor !== 'string' || (clave !== 'description' && valor.length > LARGO_MAXIMO)) return null;
    campos[clave] = valor.trim() || null;
  }

  if (entrada.use_tax_from_document !== undefined) {
    if (typeof entrada.use_tax_from_document !== 'boolean') return null;
    campos.use_tax_from_document = entrada.use_tax_from_document;
  }
  if (entrada.is_active !== undefined) {
    if (typeof entrada.is_active !== 'boolean') return null;
    campos.is_active = entrada.is_active;
  }
  if (entrada.priority !== undefined) {
    const prioridad = entrada.priority;
    if (typeof prioridad !== 'number' || !Number.isInteger(prioridad) || prioridad < -32768 || prioridad > 32767) return null;
    campos.priority = prioridad;
  }
  if (entrada.conditions !== undefined) {
    const condiciones = entrada.conditions;
    if (condiciones !== null && (typeof condiciones !== 'object' || Array.isArray(condiciones))) return null;
    campos.conditions = condiciones as Record<string, unknown> | null;
  }

  return modo === 'actualizar' && Object.keys(campos).length === 0 ? null : campos;
}

export interface ErrorRegla {
  codigo: CodigoErrorRegla;
  lado: LadoRegla | null;
  cuenta: string | null;
}

/** Error de Postgres o PostgREST → código estable. Nunca deja pasar el texto crudo. */
export function errorDeRegla(error: { code?: string; message?: string; details?: string | null } | null | undefined): ErrorRegla {
  const mensaje = error?.message ?? '';
  const detalle = /lado=(\w+);cuenta=(.+)$/.exec(error?.details ?? '');
  const lado = LADOS_REGLA.find((valor) => valor === detalle?.[1]) ?? null;
  const cuenta = detalle?.[2]?.trim() || null;
  const codigo = CODIGOS_ERROR_REGLA.find((valor) => valor !== 'desconocido' && mensaje.includes(valor));
  if (codigo) return { codigo, lado, cuenta };
  if (error?.code === '42501' || mensaje.includes('Acceso denegado')) return { codigo: 'sin_permiso', lado: null, cuenta: null };
  return { codigo: 'desconocido', lado: null, cuenta: null };
}

export type EstadoCuentaRegla = 'inexistente' | 'inactiva' | 'titulo';
export type EvidenciaPropuesta = 'configuracion' | 'plan' | 'uso' | 'conflicto' | 'ninguna';

/** Una fila de `fn_reglas_contables_diagnostico`. */
export interface CuentaInvalida {
  regla_id: string;
  lado: LadoRegla;
  cuenta: string;
  estado: EstadoCuentaRegla;
  propuesta: string | null;
  propuesta_nombre: string | null;
  evidencia: EvidenciaPropuesta;
  usos_propuesta: number;
}

export function agruparPorRegla(filas: readonly CuentaInvalida[]): Map<string, CuentaInvalida[]> {
  const grupos = new Map<string, CuentaInvalida[]>();
  for (const fila of filas) {
    const grupo = grupos.get(fila.regla_id);
    if (grupo) grupo.push(fila);
    else grupos.set(fila.regla_id, [fila]);
  }
  return grupos;
}

/** Un filtro de texto sobre nombre, evento y cuentas de la regla. */
export function coincideBusqueda(
  regla: { name: string; debit_account_code: string; credit_account_code: string; tax_account_code?: string | null },
  texto: string,
): boolean {
  const aguja = texto.trim().toLowerCase();
  if (!aguja) return true;
  return [regla.name, regla.debit_account_code, regla.credit_account_code, regla.tax_account_code ?? '']
    .some((valor) => valor.toLowerCase().includes(aguja));
}

/** Filas del CSV del inventario: sin nombres de empresa. */
export function filasInventario(
  reglas: readonly { id: string; name: string; source_type: string; event_type: string }[],
  invalidas: readonly CuentaInvalida[],
): (string | number)[][] {
  const porId = new Map(reglas.map((regla) => [regla.id, regla]));
  const filas: (string | number)[][] = [];
  for (const fila of invalidas) {
    const regla = porId.get(fila.regla_id);
    if (!regla) continue;
    filas.push([
      regla.source_type,
      regla.event_type,
      regla.name,
      fila.lado,
      fila.cuenta,
      fila.estado,
      fila.propuesta ?? '',
      fila.evidencia,
      fila.usos_propuesta,
    ]);
  }
  return filas;
}
