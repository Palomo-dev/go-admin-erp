/**
 * Cliente del navegador de los anticipos a proveedores (`/api/anticipos-proveedor/**`)
 * y su adaptador para los diálogos compartidos con el saldo a favor de clientes
 * (`RegistrarAnticipoDialog`, `AplicarSaldoDialog`, `DevolverSaldoDialog`).
 * Nunca escribe tablas: cada acción es una ruta del servidor y una RPC.
 */
import { getCurrentBranchId } from '@/lib/hooks/useOrganization';
import {
  NATURALEZAS_ANTICIPO,
  TRATAMIENTOS_COMPONENTE,
  type ComponenteOperacion,
  type EvaluacionRetenciones,
  type NaturalezaAnticipo,
  type RespuestaConciliacion,
  type RespuestaListadoAnticipos,
  type ResultadoCrearAnticipo,
  type ResultadoAplicarAnticipo,
  type ResultadoDevolverAnticipo,
  type ProcedimientoDevolucion,
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

export interface FacturaVinculable {
  id: string;
  numero: string;
  fecha: string | null;
  total: number;
  /** Lo ya vinculado de este anticipo a esa factura. */
  vinculado: number | null;
}

async function leerGet<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: cabecerasSaldo() });
  return leerRespuestaSaldo<T>(r);
}

/** Lo que el complemento del diálogo pone en `extra` (P1 y ronda 2: naturaleza, composición y retenciones). */
export interface DatosRetencionAnticipo {
  naturaleza: NaturalezaAnticipo;
  /** Suma homogénea con IVA incluido a la tarifa general; null si va por componentes. */
  tarifaIva: number | null;
  /** Composición por línea y tarifa (excluidos, exentos, AIU…); null si es suma homogénea. */
  componentes: ComponenteOperacion[] | null;
  retefuenteId: string | null;
  /** Regla municipal de ReteICA. */
  reteicaId: string | null;
  /** La actividad se realiza en el municipio de la regla. */
  icaTerritorial: boolean | null;
}

/** Forma mínima de un componente; la base vuelve a validarlo todo. */
const esComponente = (c: unknown): c is ComponenteOperacion => {
  const x = (c ?? {}) as Record<string, unknown>;
  return (TRATAMIENTOS_COMPONENTE as readonly string[]).includes(String(x.tratamiento)) && typeof x.base === 'number' && x.base > 0;
};

/** `extra` del diálogo → datos tipados; null si falta la naturaleza (no hay valor por defecto). */
export function datosRetencionDe(extra: Record<string, unknown> | null | undefined): DatosRetencionAnticipo | null {
  const e = extra ?? {};
  const naturaleza = e.naturaleza;
  if (typeof naturaleza !== 'string' || !(NATURALEZAS_ANTICIPO as readonly string[]).includes(naturaleza)) return null;
  const texto = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    naturaleza: naturaleza as NaturalezaAnticipo,
    tarifaIva: typeof e.tarifaIva === 'number' && Number.isFinite(e.tarifaIva) ? e.tarifaIva : null,
    componentes: Array.isArray(e.componentes) && e.componentes.length > 0 ? (e.componentes as unknown[]).filter(esComponente) : null,
    retefuenteId: texto(e.retefuenteId),
    reteicaId: texto(e.reteicaId),
    icaTerritorial: typeof e.icaTerritorial === 'boolean' ? e.icaTerritorial : null,
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
      componentes: e.componentes,
      retefuente_id: e.retefuenteId,
      reteica_id: e.reteicaId,
      ica_territorial: e.icaTerritorial,
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
      componentes: e.componentes,
      retefuente_id: e.retefuenteId,
      reteica_id: e.reteicaId,
      ica_territorial: e.icaTerritorial,
    });
  },

  /** Con `correccion` (motivo y soporte): corrige una retención que la factura repitió (ronda 2). */
  aplicar: (anticipoId: string, e: { cuentaId: string; monto: number; claveIdempotencia: string; correccion?: { motivo: string; soporte: string } | null }) =>
    enviarSaldo<ResultadoAplicarAnticipo>(`${BASE}/${encodeURIComponent(anticipoId)}/aplicar`, {
      cuenta_id: e.cuentaId,
      monto: e.monto,
      clave_idempotencia: e.claveIdempotencia,
      ...(e.correccion ? { correccion: e.correccion } : {}),
    }),

  /** Facturas en borrador del proveedor del anticipo (las vinculables). */
  facturasVinculables: (anticipoId: string) =>
    leerGet<{ facturas: FacturaVinculable[] }>(`${BASE}/${encodeURIComponent(anticipoId)}/vincular`),

  /** Ronda 2, ítem 5: vincula antes de causar; la causación no retendrá otra vez sobre esa base. */
  vincular: (anticipoId: string, e: { facturaId: string; monto: number }) =>
    enviarSaldo<unknown>(`${BASE}/${encodeURIComponent(anticipoId)}/vincular`, { factura_id: e.facturaId, monto: e.monto }),

  /** Ronda 2, ítem 9: cierra un pendiente contable con resolución y soporte. */
  resolverPendiente: (pendienteId: string, e: { resolucion: string; soporte: string }) =>
    enviarSaldo<unknown>(`${BASE}/pendientes/${encodeURIComponent(pendienteId)}/resolver`, { resolucion: e.resolucion.trim(), soporte: e.soporte.trim() }),

  /** Ronda 2, ítem 10: cuenta fuera de 133005xx aprobada como equivalente, con nota. */
  aprobarEquivalencia: (e: { cuenta: string; nota: string }) =>
    enviarSaldo<unknown>(`${BASE}/cuenta/equivalencia`, { cuenta: e.cuenta.trim(), nota: e.nota.trim() }),

  /**
   * `monto` = dinero que regresa. `procedimiento`: causa, soportes y cálculo (las retenciones salen de él);
   * null = no se puede determinar (queda pendiente contable).
   */
  devolver: (
    anticipoId: string,
    e: {
      monto: number;
      metodo: string;
      motivo: string;
      cuentaBancaria: number | null;
      referencia: string;
      claveIdempotencia: string;
      procedimiento: ProcedimientoDevolucion | null;
    },
  ) =>
    enviarSaldo<ResultadoDevolverAnticipo>(`${BASE}/${encodeURIComponent(anticipoId)}/devolver`, {
      monto: e.monto,
      metodo: e.metodo,
      motivo: e.motivo,
      cuenta_bancaria: e.cuentaBancaria,
      referencia: e.referencia.trim(),
      clave_idempotencia: e.claveIdempotencia,
      procedimiento: e.procedimiento,
    }),

  /**
   * Rondas 3 y 4: reintegro del exceso de una retención al proveedor. El período de descuento no se elige (lo fija la
   * regla del impuesto en la base); con reteICA viajan las pruebas del procedimiento municipal.
   */
  reintegrarExceso: (
    anticipoId: string,
    e: {
      clase: 'retefuente' | 'reteiva' | 'reteica';
      baseCorrecta: number;
      tarifaCorrecta: number;
      metodo: string;
      motivo: string;
      /** Ronda 5: con reteIVA, también la manifestación escrita de no imputación del retenido. */
      soportes: {
        calculo: string;
        certificado: string;
        solicitud: string;
        pruebas: string;
        manifestacion_no_imputacion?: string | null;
        ica?: Record<string, string> | null;
      };
      requiereCorreccion: boolean;
      claveIdempotencia: string;
    },
  ) =>
    enviarSaldo<unknown>(`${BASE}/${encodeURIComponent(anticipoId)}/retencion-exceso`, {
      clase: e.clase,
      base_correcta: e.baseCorrecta,
      tarifa_correcta: e.tarifaCorrecta,
      metodo: e.metodo,
      motivo: e.motivo.trim(),
      soportes: e.soportes,
      periodo_descuento: null,
      requiere_correccion: e.requiereCorreccion,
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
  aplicar: (e) => {
    const c = (e.extra?.correccion ?? null) as { motivo?: unknown; soporte?: unknown } | null;
    const correccion = c && typeof c.motivo === 'string' && typeof c.soporte === 'string' ? { motivo: c.motivo, soporte: c.soporte } : null;
    return anticiposProveedorService.aplicar(e.saldoId, { cuentaId: e.documentoId, monto: e.monto, claveIdempotencia: e.claveIdempotencia, correccion });
  },
  devolver: (saldoId, e) => {
    // Sin procedimiento (null) → pendiente contable en la base; las retenciones salen del procedimiento.
    const p = e.extra?.procedimiento;
    const procedimiento = p && typeof p === 'object' ? (p as ProcedimientoDevolucion) : null;
    return anticiposProveedorService.devolver(saldoId, { ...e, procedimiento });
  },
};
