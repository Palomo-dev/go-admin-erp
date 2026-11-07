/**
 * Vista previa del asiento que generaría una regla contable (Figma «Editar
 * regla» 991:80586, `VistaPreviaRegla`). Se calcula en el navegador con el plan
 * de cuentas ya cargado y un documento de ejemplo: no escribe ni lee nada.
 *
 * Estados: `sinDatos` (faltan cuentas) · `inexistente` (una cuenta no está en el
 * plan o está inactiva) · `agrupadora` (una cuenta es de título) · `cuadra`.
 * Lo que bloquea guardar sigue siendo `cuentaBloqueada` (igual que el
 * disparador de la base); la vista previa solo lo explica.
 */
import { falloCuentaEnRegla, type CuentaDePlan } from '@/lib/finanzas/reglasContables';

export type EstadoVistaPrevia = 'sinDatos' | 'inexistente' | 'agrupadora' | 'cuadra';
export type EstadoCuentaVista = 'ok' | 'inexistente' | 'agrupadora';
export type LadoVistaPrevia = 'debito' | 'credito' | 'impuesto';

export interface LineaVistaPrevia {
  lado: LadoVistaPrevia;
  cuenta: string;
  nombre: string | null;
  debito: number;
  credito: number;
  estado: EstadoCuentaVista;
}

export interface VistaPreviaRegla {
  estado: EstadoVistaPrevia;
  lineas: LineaVistaPrevia[];
  /** Total del documento de ejemplo (base + impuesto). */
  total: number;
  base: number;
  impuesto: number;
}

export interface ReglaParaVista {
  source_type: string;
  debit_account_code: string;
  credit_account_code: string;
  tax_account_code?: string | null;
}

/** Documentos en los que el IVA es descontable (va al débito). En el resto, IVA generado (crédito). */
const IVA_AL_DEBITO = new Set(['purchase', 'purchase_order', 'expense', 'support_document']);

export const BASE_EJEMPLO = 100000;
export const TARIFA_EJEMPLO = 0.19;

function estadoCuenta(codigo: string, plan: readonly CuentaDePlan[]): EstadoCuentaVista {
  const fallo = falloCuentaEnRegla(codigo, plan);
  if (fallo === 'cuenta_de_titulo') return 'agrupadora';
  if (fallo) return 'inexistente';
  return 'ok';
}

export function ivaAlDebito(source: string): boolean {
  return IVA_AL_DEBITO.has(source);
}

export function vistaPreviaRegla(
  regla: ReglaParaVista,
  plan: readonly (CuentaDePlan & { name?: string | null })[],
  opciones: { base?: number; tarifa?: number } = {},
): VistaPreviaRegla {
  const base = opciones.base ?? BASE_EJEMPLO;
  const tarifa = opciones.tarifa ?? TARIFA_EJEMPLO;
  const debito = regla.debit_account_code.trim();
  const credito = regla.credit_account_code.trim();
  const iva = (regla.tax_account_code ?? '').trim();
  const impuesto = iva ? Math.round(base * tarifa * 100) / 100 : 0;
  const total = base + impuesto;

  if (!debito || !credito) return { estado: 'sinDatos', lineas: [], total, base, impuesto };

  const nombre = (codigo: string) => plan.find((c) => c.account_code === codigo)?.name ?? null;
  const linea = (lado: LadoVistaPrevia, cuenta: string, d: number, c: number): LineaVistaPrevia => ({
    lado,
    cuenta,
    nombre: nombre(cuenta),
    debito: d,
    credito: c,
    estado: estadoCuenta(cuenta, plan),
  });

  const lineas: LineaVistaPrevia[] = [];
  if (iva && ivaAlDebito(regla.source_type)) {
    lineas.push(linea('debito', debito, base, 0), linea('impuesto', iva, impuesto, 0), linea('credito', credito, 0, total));
  } else if (iva) {
    lineas.push(linea('debito', debito, total, 0), linea('credito', credito, 0, base), linea('impuesto', iva, 0, impuesto));
  } else {
    lineas.push(linea('debito', debito, total, 0), linea('credito', credito, 0, total));
  }

  const estado: EstadoVistaPrevia = lineas.some((l) => l.estado === 'inexistente')
    ? 'inexistente'
    : lineas.some((l) => l.estado === 'agrupadora')
      ? 'agrupadora'
      : 'cuadra';
  return { estado, lineas, total, base, impuesto };
}
