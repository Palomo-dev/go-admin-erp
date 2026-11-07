/**
 * Métodos de pago de los diálogos de saldo a favor (devolver y registrar
 * anticipo), sin React: los de la organización (contexto del servidor), sin
 * «crédito» (no mueve dinero: la base lo rechaza) y con el efectivo
 * deshabilitado, con su motivo, si no hay caja abierta en la sucursal.
 */
import type { MetodoPagoOpcion } from '@/components/kit/metodosPago';
import type { ContextoSaldoFavor } from '@/lib/finanzas/saldosAFavor/contrato';

export function opcionesMetodoSaldo(contexto: ContextoSaldoFavor | null, motivoSinCaja: string): MetodoPagoOpcion[] {
  if (!contexto) return [];
  return contexto.metodos
    .filter((m) => m.code !== 'credit')
    .map((m) => ({
      codigo: m.code,
      nombre: m.name,
      deshabilitado: m.code === 'cash' && !contexto.caja.abierta,
      motivo: m.code === 'cash' && !contexto.caja.abierta ? motivoSinCaja : undefined,
    }));
}

/** Primer método usable: el efectivo si hay caja; si no, el primero habilitado. */
export function metodoInicial(opciones: readonly MetodoPagoOpcion[]): string | null {
  return opciones.find((m) => !m.deshabilitado)?.codigo ?? null;
}

export function requiereReferencia(contexto: ContextoSaldoFavor | null, metodo: string | null): boolean {
  return !!contexto?.metodos.find((m) => m.code === metodo)?.requires_reference;
}
