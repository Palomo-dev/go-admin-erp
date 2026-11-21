/**
 * Lo que la tabla y la tarjeta de Ventas muestran en su segunda línea y en los
 * KPI (Figma `329:36071` y `331:54670`, aprobado el 2026-11-20). Reglas puras,
 * sin textos: la pantalla las traduce. Módulo hoja.
 */
import type { CifrasVentas, FilaVenta, ImpuestoVentas } from './listadoServidor';

/** Segunda línea bajo el N.º, en orden de prioridad. */
export type LineaNumero =
  | { tipo: 'local'; texto: string }
  | { tipo: 'saldo'; monto: number }
  | { tipo: 'notaCredito'; numero: string | null; cantidad: number }
  | { tipo: 'pedidoWeb' }
  | { tipo: 'id'; texto: string };

type FilaLinea = Pick<FilaVenta, 'id' | 'estado' | 'saldo' | 'origen' | 'notas_credito'> & Partial<Pick<FilaVenta, 'nota_credito_numero'>>;

export function lineaNumero(f: FilaLinea): LineaNumero {
  // Venta del outbox del Desktop: su id local («local-8821»).
  if (f.estado === 'pendiente_sincronizar') return { tipo: 'local', texto: `local-${f.id.replace(/^local-/, '').slice(0, 4)}` };
  if (f.saldo > 0.005 && f.estado !== 'anulada' && f.estado !== 'borrador') return { tipo: 'saldo', monto: f.saldo };
  if (f.notas_credito > 0) return { tipo: 'notaCredito', numero: f.nota_credito_numero ?? null, cantidad: f.notas_credito };
  if (f.origen === 'web') return { tipo: 'pedidoWeb' };
  return { tipo: 'id', texto: f.id.slice(0, 8) };
}

/** Segunda línea bajo el cliente. */
export type LineaCliente =
  | { tipo: 'mesa'; mesa: string | null; cajero: string | null }
  | { tipo: 'documento'; tipoDocumento: string | null; numero: string }
  | { tipo: 'telefono'; telefono: string }
  | null;

type FilaCliente = Pick<FilaVenta, 'origen' | 'cliente' | 'cajero'> & Partial<Pick<FilaVenta, 'mesa'>>;

export function lineaCliente(f: FilaCliente): LineaCliente {
  // Mesa: «Mesa 7 · Laura R.» (quién atendió dice más que un documento vacío).
  if (f.origen === 'mesa' && (f.mesa || !f.cliente?.documento)) return { tipo: 'mesa', mesa: f.mesa ?? null, cajero: nombreCorto(f.cajero.nombre) };
  if (f.cliente?.documento) return { tipo: 'documento', tipoDocumento: f.cliente.tipo_documento ?? null, numero: f.cliente.documento };
  if (f.cliente?.telefono) return { tipo: 'telefono', telefono: f.cliente.telefono };
  return null;
}

/** «Laura Restrepo Gómez» → «Laura R.». */
export function nombreCorto(nombre: string | null | undefined): string | null {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return null;
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[1].charAt(0).toUpperCase()}.`;
}

/** Nombre de mesa: «7» → número para «Mesa 7»; «Terraza 2» se deja tal cual. */
export function mesaEsNumero(mesa: string | null): boolean {
  return !!mesa && /^\d+$/.test(mesa.trim());
}

/**
 * Documento con separador de miles cuando es solo número («1020334556» →
 * «1.020.334.556») o NIT con dígito de verificación («901455221-3» →
 * «901.455.221-3»). Lo demás (pasaportes, con letras) queda igual.
 */
export function formatearDocumento(doc: string, entero: (n: number) => string): string {
  const limpio = doc.trim();
  const solo = /^\d{1,15}$/.exec(limpio);
  if (solo) return entero(Number(limpio));
  const nit = /^(\d{1,15})-(\d)$/.exec(limpio);
  if (nit) return `${entero(Number(nit[1]))}-${nit[2]}`;
  return limpio;
}

/** Variación porcentual con un decimal; null sin base de comparación. */
export function variacion(actual: number, anterior: number | null | undefined): number | null {
  if (!anterior) return null;
  return Math.round(((actual - anterior) / Math.abs(anterior)) * 1000) / 10;
}

/** Cómo nombrar un impuesto del detalle. */
export type NombreImpuesto =
  | { clase: 'tipoTasa'; tipo: string; tasa: number }
  | { clase: 'nombre'; nombre: string }
  | { clase: 'sinDetalle' };

/**
 * «IVA_19» + 19 → IVA 19 %; «INC_8» → INC 8 %; un nombre del desglose de la
 * venta («IVA 19%») se respeta; sin código ni nombre → «sin detalle».
 */
export function nombreImpuesto(i: Pick<ImpuestoVentas, 'codigo' | 'tasa'>): NombreImpuesto {
  const codigo = i.codigo?.trim() ?? '';
  const m = /^([A-Za-z]+)[_\s-]?(\d+(?:[.,]\d+)?)?$/.exec(codigo);
  if (m && (i.tasa != null || m[2])) {
    const tasa = i.tasa != null ? Number(i.tasa) : Number(m[2].replace(',', '.'));
    if (Number.isFinite(tasa)) return { clase: 'tipoTasa', tipo: m[1].toUpperCase(), tasa };
  }
  if (codigo) return { clase: 'nombre', nombre: codigo };
  if (i.tasa != null && Number.isFinite(Number(i.tasa))) return { clase: 'tipoTasa', tipo: 'IVA', tasa: Number(i.tasa) };
  return { clase: 'sinDetalle' };
}

/** Detalle de «Transacciones» (Figma): pagadas · pendientes · anuladas siempre; devueltas solo si hay. */
export function partesTransacciones(a: CifrasVentas['actual']): { clave: 'pagadas' | 'pendientes' | 'anuladas' | 'devueltas'; n: number }[] {
  const partes = [
    { clave: 'pagadas' as const, n: a.pagadas },
    { clave: 'pendientes' as const, n: a.pendientes },
    { clave: 'anuladas' as const, n: a.anuladas },
    { clave: 'devueltas' as const, n: a.devueltas },
  ];
  return partes.filter((p) => p.clave !== 'devueltas' || p.n > 0);
}
