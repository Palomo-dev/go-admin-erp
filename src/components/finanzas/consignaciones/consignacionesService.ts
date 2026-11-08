/**
 * Cliente del navegador de Consignaciones (`/api/consignaciones/**`). Nunca
 * escribe tablas: cada acción es una ruta del servidor y sus RPC. Los errores
 * llegan como `ErrorPeticionSaldoFavor` con su `codigo` (mismo lector que los
 * saldos a favor), para mostrarlos con `finanzasTercerosR4.consignaciones.errores.<codigo>`.
 */
import type { NotaConsignacion, RespuestaListadoConsignaciones } from '@/lib/finanzas/consignaciones/consignaciones';
import { cabecerasSaldo, enviarSaldo, leerRespuestaSaldo } from '@/components/finanzas/saldos-a-favor/saldosAFavorService';

const BASE = '/api/consignaciones';

export interface ResultadoLiquidarCliente {
  liquidacionId: string;
  estado: 'por_facturar' | 'liquidada';
  facturaId: string | null;
  facturaNumero: string | null;
  venta: number;
  comision: number;
  neto: number;
  enviarDian: boolean;
  errorFactura: string | null;
}

async function leerGet<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: cabecerasSaldo() });
  return leerRespuestaSaldo<T>(r);
}

export const consignacionesService = {
  listar: () => leerGet<RespuestaListadoConsignaciones>(BASE),
  detalle: (id: string) => leerGet<{ pendiente: boolean; nota: NotaConsignacion | null }>(`${BASE}/${encodeURIComponent(id)}`),
  entregar: (e: {
    clienteId: string;
    sucursalId: number;
    comision: number;
    /** Condiciones del contrato (`terminosDeCondiciones`); la clasificación es obligatoria. */
    terminos: Record<string, unknown>;
    ubicacion: string;
    notas: string;
    lineas: { product_id: number; qty: number; precio?: number | null }[];
    claveIdempotencia: string;
  }) =>
    enviarSaldo<{ nota_id: string; numero: string; repetida: boolean; costo: number }>(BASE, {
      cliente_id: e.clienteId,
      sucursal_id: e.sucursalId,
      comision: e.comision,
      terminos: e.terminos,
      ubicacion: e.ubicacion.trim() || null,
      notas: e.notas.trim() || null,
      lineas: e.lineas,
      clave_idempotencia: e.claveIdempotencia,
    }),
  liquidar: (notaId: string, e: { lineas: { linea_id: string; vendido: number; precio: number; devuelto: number }[]; claveIdempotencia: string }) =>
    enviarSaldo<ResultadoLiquidarCliente>(`${BASE}/${encodeURIComponent(notaId)}/liquidar`, {
      lineas: e.lineas,
      clave_idempotencia: e.claveIdempotencia,
    }),
  facturar: (liquidacionId: string, claveIdempotencia: string) =>
    enviarSaldo<ResultadoLiquidarCliente>(`${BASE}/liquidaciones/${encodeURIComponent(liquidacionId)}/facturar`, {
      clave_idempotencia: claveIdempotencia,
    }),
};
