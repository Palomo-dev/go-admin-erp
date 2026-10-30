/**
 * Cálculo puro de la «salida anticipada» (cancelar estadía en curso).
 * Módulo hoja sin Supabase: lo usan el servicio, el diálogo y las pruebas.
 */
export interface EntradaSalidaAnticipada {
  checkin: string; // YYYY-MM-DD
  checkout: string; // YYYY-MM-DD (salida prevista)
  hoy: string; // YYYY-MM-DD
  totalHospedaje: number; // hospedaje previsto (folio room_charge o total_estimated)
  consumos: number; // cargos del folio que no son hospedaje
  pagos: number; // pagos del folio + depósitos de la reserva
}

export interface ResumenSalidaAnticipada {
  nochesPrevistas: number;
  nochesUsadas: number;
  nochesAnuladas: number;
  tarifaNoche: number;
  hospedajeUsado: number;
  hospedajeAnulado: number;
  consumos: number;
  totalACobrar: number;
  pagos: number;
  saldo: number; // > 0 deuda del huésped; < 0 saldo a favor
}

const DIA = 86_400_000;
const dias = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / DIA);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function calcularSalidaAnticipada(e: EntradaSalidaAnticipada): ResumenSalidaAnticipada {
  const nochesPrevistas = Math.max(1, dias(e.checkin, e.checkout));
  // La noche de llegada siempre se cobra (salir el mismo día del check-in = 1 noche).
  const nochesUsadas = Math.min(nochesPrevistas, Math.max(1, dias(e.checkin, e.hoy)));
  const nochesAnuladas = nochesPrevistas - nochesUsadas;
  const tarifaNoche = e.totalHospedaje / nochesPrevistas;
  const hospedajeUsado = r2(tarifaNoche * nochesUsadas);
  const hospedajeAnulado = r2(e.totalHospedaje - hospedajeUsado);
  const totalACobrar = r2(hospedajeUsado + e.consumos);
  return {
    nochesPrevistas,
    nochesUsadas,
    nochesAnuladas,
    tarifaNoche: r2(tarifaNoche),
    hospedajeUsado,
    hospedajeAnulado,
    consumos: r2(e.consumos),
    totalACobrar,
    pagos: r2(e.pagos),
    saldo: r2(totalACobrar - e.pagos),
  };
}
