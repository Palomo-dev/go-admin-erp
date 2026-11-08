/**
 * Cliente del navegador de los anticipos a proveedores (`/api/anticipos-proveedor/**`)
 * y su adaptador para los diálogos compartidos con el saldo a favor de clientes
 * (`RegistrarAnticipoDialog`, `AplicarSaldoDialog`, `DevolverSaldoDialog`).
 * Nunca escribe tablas: cada acción es una ruta del servidor y una RPC.
 */
import { getCurrentBranchId } from '@/lib/hooks/useOrganization';
import {
  NATURALEZAS_ANTICIPO,
  type EvaluacionRetenciones,
  type NaturalezaAnticipo,
  type RespuestaConciliacion,
  type RespuestaListadoAnticipos,
  type ResultadoCrearAnticipo,
} from '@/lib/finanzas/anticiposProveedor/contrato';
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

/** Lo que el complemento del diálogo pone en `extra` (P1: naturaleza y retenciones). */
export interface DatosRetencionAnticipo {
  naturaleza: NaturalezaAnticipo;
  tarifaIva: number | null;
  retefuenteId: string | null;
  reteicaId: string | null;
}

/** `extra` del diálogo → datos tipados; null si falta la naturaleza (no hay valor por defecto). */
export function datosRetencionDe(extra: Record<string, unknown> | null | undefined): DatosRetencionAnticipo | null {
  const e = extra ?? {};
  const naturaleza = e.naturaleza;
  if (typeof naturaleza !== 'string' || !(NATURALEZAS_ANTICIPO as readonly string[]).includes(naturaleza)) return null;
  const texto = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    naturaleza: naturaleza as NaturalezaAnticipo,
    tarifaIva: typeof e.tarifaIva === 'number' && Number.isFinite(e.tarifaIva) ? e.tarifaIva : null,
    retefuenteId: texto(e.retefuenteId),
    reteicaId: texto(e.reteicaId),
  };
}

export const anticiposProveedorService = {
  listar: () => leerGet<RespuestaListadoAnticipos>(BASE),

  conciliacion: () => leerGet<RespuestaConciliacion>(`${BASE}/conciliacion`),

  contexto: (sucursalId: number | null, proveedorId?: string | null) => {
    const q = new URLSearchParams();
    if (sucursalId != null) q.set('sucursal', String(sucursalId));
    if (proveedorId) q.set('proveedor', proveedorId);
    const s = q.toString();
    return leerGet<ContextoSaldoFavor>(s ? `${BASE}/contexto?${s}` : `${BASE}/contexto`);
  },

  /** Vista previa de renta, reteIVA y reteICA (no escribe). */
  evaluarRetenciones: (e: { proveedorId: string; monto: number } & DatosRetencionAnticipo) =>
    enviarSaldo<EvaluacionRetenciones>(`${BASE}/retenciones`, {
      proveedor_id: Number(e.proveedorId),
      monto: e.monto,
      naturaleza: e.naturaleza,
      tarifa_iva: e.tarifaIva,
      retefuente_id: e.retefuenteId,
      reteica_id: e.reteicaId,
    }),

  crear: (
    e: {
      proveedorId: string;
      sucursalId: number | null;
      monto: number;
      metodo: string;
      cuentaBancaria: number | null;
      referencia: string;
      notas: string;
      claveIdempotencia: string;
    } & DatosRetencionAnticipo,
  ) => {
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
      naturaleza: e.naturaleza,
      tarifa_iva: e.tarifaIva,
      retefuente_id: e.retefuenteId,
      reteica_id: e.reteicaId,
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
      referencia: e.referencia.trim(),
      clave_idempotencia: e.claveIdempotencia,
    }),

  /** P7: solo si el desembolso registrado NO ocurrió; con soporte y fecha del ajuste. */
  anularPorError: (anticipoId: string, e: { motivo: string; soporte: string; fechaAjuste: string | null }) =>
    enviarSaldo<unknown>(`${BASE}/${encodeURIComponent(anticipoId)}/anular`, {
      declaracion: 'desembolso_no_ocurrio',
      motivo: e.motivo,
      soporte: e.soporte,
      fecha_ajuste: e.fechaAjuste,
    }),
};

/** El espejo del proveedor para los diálogos compartidos. Constante de módulo: no cambia entre renders. */
export const ADAPTADOR_PROVEEDOR: AdaptadorSaldos = {
  tercero: 'proveedor',
  namespace: 'finanzasTercerosR4.anticipos',
  conVencimiento: false,
  soporteObligatorio: true,
  contexto: (sucursalId) => anticiposProveedorService.contexto(sucursalId),
  documentosAbiertos: async (proveedorId) => (await anticiposProveedorService.contexto(null, proveedorId)).facturas,
  registrar: async (e) => {
    const datos = datosRetencionDe(e.extra);
    // Sin naturaleza no se manda nada: el servidor también lo rechazaría (P1, sin valor por defecto).
    if (!datos) throw new ErrorPeticionSaldoFavor('naturaleza_obligatoria', 422);
    const r = await anticiposProveedorService.crear({
      proveedorId: e.terceroId,
      sucursalId: e.sucursalId,
      monto: e.monto,
      metodo: e.metodo,
      cuentaBancaria: e.cuentaBancaria,
      referencia: e.referencia,
      notas: e.notas,
      claveIdempotencia: e.claveIdempotencia,
      ...datos,
    });
    return { id: r.anticipo_id, recibo: r.recibo };
  },
  aplicar: (e) => anticiposProveedorService.aplicar(e.saldoId, { cuentaId: e.documentoId, monto: e.monto, claveIdempotencia: e.claveIdempotencia }),
  devolver: (saldoId, e) => anticiposProveedorService.devolver(saldoId, e),
};
