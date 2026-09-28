/**
 * Contrato del detalle de una cuenta por cobrar (`GET /api/cartera/[id]`),
 * compartido por Finanzas y por el POS. Módulo hoja.
 */

export interface CuotaCartera {
  id: string;
  numero: number;
  /** `ar_installments.due_date` es `date`: se pinta con `formatPlainDate`. */
  vencimiento: string;
  monto: number;
  pagado: number;
  saldo: number;
  estado: string;
  dias: number;
}

export interface PagoCartera {
  id: string;
  fecha: string | null;
  metodo: string | null;
  metodoNombre: string | null;
  monto: number;
  cambio: number;
  referencia: string | null;
  estado: string;
  recibo: string | null;
  origen: string | null;
  cuotaId: string | null;
  anuladoEn: string | null;
  motivoAnulacion: string | null;
}

export interface DetalleCuentaPorCobrar {
  cuenta: {
    id: string;
    estado: string;
    dias: number;
    monto: number;
    saldo: number;
    vencimiento: string | null;
    creada: string | null;
    ultimoRecordatorio: string | null;
    branchId: number | null;
    sucursal: string | null;
    moneda: string | null;
  };
  factura: { id: string; numero: string | null; emision: string | null; total: number; estado: string } | null;
  saleId: string | null;
  cliente: {
    id: string;
    nombre: string | null;
    documento: string | null;
    email: string | null;
    telefono: string | null;
    carteraTotal: number;
  } | null;
  cuotas: CuotaCartera[];
  pagos: PagoCartera[];
  recordatorios: { fecha: string; canal: string; estado: string; destino: string | null; error: string | null }[];
}

/** Próxima cuota por pagar: la de menor número que no esté pagada ni castigada. */
export function proximaCuota(cuotas: readonly CuotaCartera[]): CuotaCartera | null {
  return [...cuotas].filter((q) => q.estado !== 'paid' && q.estado !== 'written_off' && q.saldo > 0).sort((a, b) => a.numero - b.numero)[0] ?? null;
}
