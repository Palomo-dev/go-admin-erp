/**
 * Estado de cuenta: payload del motor de documentos (`cargarEstadoCuenta`) →
 * vista del kit (`EstadoCuentaVista`). Función pura: no recalcula nada, solo
 * traduce, para que el diálogo y el PDF no puedan diferir.
 */
import type { CeldaTabla, DocumentoPayload } from '@/lib/documents/tipos';
import type { EstadoCuentaVista, MovimientoCuenta } from '@/components/kit/documento/carteraLogica';
import { toPlainDate } from '@/lib/utils/dateCore';

const TIPO_POR_CONCEPTO: Record<string, MovimientoCuenta['tipo']> = {
  'movimientos.factura': 'factura',
  'movimientos.notaCredito': 'notaCredito',
  'movimientos.pago': 'pago',
};

const num = (v: CeldaTabla | undefined): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : 0;
  return Number.isFinite(n) ? n : 0;
};

function valorResumen(payload: DocumentoPayload, clave: string): number {
  const fila = payload.resumen.find((r) => r.clave === clave);
  const v = fila?.valor as { v?: unknown } | undefined;
  return Number(v?.v) || 0;
}

export function vistaDesdePayload(payload: DocumentoPayload): EstadoCuentaVista {
  const zona = payload.zonaHoraria;
  const movs = payload.secciones.find((s) => s.titulo === 'movimientos');
  const tramos = payload.secciones.find((s) => s.titulo === 'antiguedad')?.filas[0] ?? [];
  const movimientos: MovimientoCuenta[] = (movs?.filas ?? []).map((f, i) => {
    const instante = typeof f[0] === 'string' ? new Date(f[0]) : null;
    return {
      id: `${i}`,
      dia: instante && !Number.isNaN(instante.getTime()) ? toPlainDate(instante, zona) : '',
      tipo: TIPO_POR_CONCEPTO[String(f[1])] ?? 'pago',
      documento: typeof f[2] === 'string' ? f[2] : null,
      vence: null,
      cargo: num(f[3]),
      abono: num(f[4]),
      saldo: num(f[5]),
    };
  });
  return {
    saldoInicial: valorResumen(payload, 'saldoInicial'),
    saldoFinal: valorResumen(payload, 'saldoFinal'),
    porVencer: num(tramos[0]),
    vencido: num(tramos[1]) + num(tramos[2]) + num(tramos[3]) + num(tramos[4]),
    totalCargos: valorResumen(payload, 'cargos'),
    totalAbonos: valorResumen(payload, 'abonos'),
    movimientos,
  };
}
