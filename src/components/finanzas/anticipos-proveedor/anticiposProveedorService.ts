/**
 * Cliente del navegador de los anticipos a proveedores (`/api/anticipos-proveedor/**`)
 * y su adaptador para los diálogos compartidos con el saldo a favor de clientes
 * (`RegistrarAnticipoDialog`, `AplicarSaldoDialog`, `DevolverSaldoDialog`).
 * Nunca escribe tablas: cada acción es una ruta del servidor y una RPC.
 */
import { getCurrentBranchId } from '@/lib/hooks/useOrganization';
import type { RespuestaListadoAnticipos, ResultadoCrearAnticipo } from '@/lib/finanzas/anticiposProveedor/contrato';
import type { ContextoSaldoFavor } from '@/lib/finanzas/saldosAFavor/contrato';
import type { AdaptadorSaldos } from '@/components/finanzas/saldos-a-favor/adaptadorSaldos';
import {
  cabecerasSaldo,
  enviarSaldo,
  ErrorPeticionSaldoFavor,
  leerRespuestaSaldo,
} from '@/components/finanzas/saldos-a-favor/saldosAFavorService';

const BASE = '/api/anticipos-proveedor';

async function leerGet<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: cabecerasSaldo() });
  return leerRespuestaSaldo<T>(r);
}

export const anticiposProveedorService = {
  listar: () => leerGet<RespuestaListadoAnticipos>(BASE),

  contexto: (sucursalId: number | null, proveedorId?: string | null) => {
    const q = new URLSearchParams();
    if (sucursalId != null) q.set('sucursal', String(sucursalId));
    if (proveedorId) q.set('proveedor', proveedorId);
    const s = q.toString();
    return leerGet<ContextoSaldoFavor>(s ? `${BASE}/contexto?${s}` : `${BASE}/contexto`);
  },

  crear: (e: {
    proveedorId: string;
    sucursalId: number | null;
    monto: number;
    metodo: string;
    cuentaBancaria: number | null;
    referencia: string;
    notas: string;
    claveIdempotencia: string;
  }) => {
    const sucursal = e.sucursalId ?? getCurrentBranchId();
    if (!sucursal) throw new ErrorPeticionSaldoFavor('sucursal_invalida', 422);
    return enviarSaldo<ResultadoCrearAnticipo>(BASE, {
      proveedor_id: Number(e.proveedorId),
      sucursal_id: sucursal,
      monto: e.monto,
      metodo: e.metodo,
      cuenta_bancaria: e.cuentaBancaria,
      referencia: e.referencia.trim() || null,
      notas: e.notas.trim() || null,
      clave_idempotencia: e.claveIdempotencia,
    });
  },

  aplicar: (anticipoId: string, e: { cuentaId: string; monto: number; claveIdempotencia: string }) =>
    enviarSaldo<unknown>(`${BASE}/${encodeURIComponent(anticipoId)}/aplicar`, {
      cuenta_id: e.cuentaId,
      monto: e.monto,
      clave_idempotencia: e.claveIdempotencia,
    }),

  devolver: (
    anticipoId: string,
    e: { monto: number; metodo: string; motivo: string; cuentaBancaria: number | null; referencia: string; claveIdempotencia: string },
  ) =>
    enviarSaldo<unknown>(`${BASE}/${encodeURIComponent(anticipoId)}/devolver`, {
      monto: e.monto,
      metodo: e.metodo,
      motivo: e.motivo,
      cuenta_bancaria: e.cuentaBancaria,
      referencia: e.referencia.trim() || null,
      clave_idempotencia: e.claveIdempotencia,
    }),

  anular: (anticipoId: string, motivo: string) =>
    enviarSaldo<unknown>(`${BASE}/${encodeURIComponent(anticipoId)}/anular`, { motivo }),
};

/** El espejo del proveedor para los diálogos compartidos. Constante de módulo: no cambia entre renders. */
export const ADAPTADOR_PROVEEDOR: AdaptadorSaldos = {
  tercero: 'proveedor',
  namespace: 'finanzasTercerosR4.anticipos',
  conVencimiento: false,
  contexto: (sucursalId) => anticiposProveedorService.contexto(sucursalId),
  documentosAbiertos: async (proveedorId) => (await anticiposProveedorService.contexto(null, proveedorId)).facturas,
  registrar: async (e) => {
    const r = await anticiposProveedorService.crear({
      proveedorId: e.terceroId,
      sucursalId: e.sucursalId,
      monto: e.monto,
      metodo: e.metodo,
      cuentaBancaria: e.cuentaBancaria,
      referencia: e.referencia,
      notas: e.notas,
      claveIdempotencia: e.claveIdempotencia,
    });
    return { id: r.anticipo_id, recibo: r.recibo };
  },
  aplicar: (e) => anticiposProveedorService.aplicar(e.saldoId, { cuentaId: e.documentoId, monto: e.monto, claveIdempotencia: e.claveIdempotencia }),
  devolver: (saldoId, e) => anticiposProveedorService.devolver(saldoId, e),
};
