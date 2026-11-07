/**
 * Cadena del dinero de un movimiento (Tesorería v2, detalle `1006:82454`):
 * turno de caja → movimiento → asiento → conciliación (banco) o consignación
 * (caja, pendiente). Arma los eslabones para `CadenaDocumento` del kit sin
 * React; los textos y formatos llegan ya resueltos.
 */
export interface DatosCadena {
  turno: { id: number; uuid: string; abiertaEn: string; abierta: boolean } | null;
  asiento: { id: number; fecha: string; publicado: boolean; numero: string | null } | null;
  conciliado: boolean | null;
}

export interface EslabonCadena {
  id: string;
  tipo: 'cuentaPorCobrar' | 'pago' | 'asiento' | 'recibo';
  etiquetaTipo: string;
  numero: string;
  estado?: string | null;
  fecha?: string | null;
  href?: string;
  actual?: boolean;
  pendiente?: boolean;
}

export interface TextosCadena {
  turno: string;
  movimiento: string;
  asiento: string;
  conciliacion: string;
  consignacion: string;
  sinAsiento: string;
  publicado: string;
  borrador: string;
  conciliado: string;
  porConciliar: string;
  pendiente: string;
  abierto: string;
  cerrado: string;
}

export function eslabonesCadena(
  m: { id: number; source: 'cash' | 'bank'; fecha: string },
  c: DatosCadena,
  textos: TextosCadena,
  formatearFecha: (iso: string) => string,
): EslabonCadena[] {
  const salida: EslabonCadena[] = [];
  if (m.source === 'cash' && c.turno) {
    salida.push({
      id: `turno-${c.turno.id}`,
      tipo: 'cuentaPorCobrar',
      etiquetaTipo: textos.turno,
      numero: `#${c.turno.id}`,
      estado: c.turno.abierta ? textos.abierto : textos.cerrado,
      fecha: formatearFecha(c.turno.abiertaEn),
      href: `/app/pos/cajas/${c.turno.uuid}`,
    });
  }
  salida.push({ id: `mov-${m.id}`, tipo: 'pago', etiquetaTipo: textos.movimiento, numero: `#${m.id}`, fecha: formatearFecha(m.fecha), actual: true });
  salida.push(
    c.asiento
      ? {
          id: `asiento-${c.asiento.id}`,
          tipo: 'asiento',
          etiquetaTipo: textos.asiento,
          numero: c.asiento.numero ?? `#${c.asiento.id}`,
          estado: c.asiento.publicado ? textos.publicado : textos.borrador,
          fecha: formatearFecha(c.asiento.fecha),
          href: `/app/finanzas/contabilidad/asientos/${c.asiento.id}`,
        }
      : { id: 'asiento', tipo: 'asiento', etiquetaTipo: textos.asiento, numero: textos.sinAsiento, pendiente: true },
  );
  if (m.source === 'bank') {
    salida.push({
      id: 'conciliacion',
      tipo: 'recibo',
      etiquetaTipo: textos.conciliacion,
      numero: c.conciliado ? textos.conciliado : textos.porConciliar,
      pendiente: !c.conciliado,
    });
  } else {
    salida.push({ id: 'consignacion', tipo: 'recibo', etiquetaTipo: textos.consignacion, numero: textos.pendiente, pendiente: true });
  }
  return salida;
}
