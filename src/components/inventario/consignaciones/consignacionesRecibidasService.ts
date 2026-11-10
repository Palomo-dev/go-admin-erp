/**
 * Cliente del navegador de la consignación recibida y del vínculo entre
 * organizaciones (`/api/consignaciones/recibidas/**`, `/api/consignaciones/por-aceptar/**`,
 * `/api/vinculos/**`). Nunca escribe tablas: cada acción es una ruta del servidor
 * y sus RPC. Los errores llegan como `ErrorPeticionSaldoFavor` con su `codigo`
 * (mismo lector que los saldos a favor), y se muestran con `consignacionesR4.errores.<codigo>`.
 */
import type {
  ClaseRetencion,
  DocumentoPorAceptar,
  NotaRecibida,
  ReglasRetencionConsignacion,
  RespuestaRecibidas,
  RetencionLiquidacion,
} from '@/lib/inventario/consignaciones/recibidas';
import { cabecerasSaldo, enviarSaldo, leerRespuestaSaldo } from '@/components/finanzas/saldos-a-favor/saldosAFavorService';

const BASE = '/api/consignaciones';

async function leerGet<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: cabecerasSaldo() });
  return leerRespuestaSaldo<{ resultado: T }>(r).then((x) => x.resultado);
}

/** `enviarSaldo` ya devuelve el `resultado` de la respuesta. */
const enviar = <T,>(url: string, cuerpo: unknown): Promise<T> => enviarSaldo<T>(url, cuerpo);

export interface ComparacionDocumento {
  nota_id: string;
  numero_nota: string;
  comision_pct: number;
  lineas: { linea_id: string; vendido: number; devuelto: number; precio: number; entregado: number; vendido_antes: number; devuelto_antes: number }[];
  diferencias: { tipo: string }[];
}

export const consignacionesRecibidasService = {
  listar: () => leerGet<RespuestaRecibidas>(`${BASE}/recibidas`),
  detalle: (id: string) => leerGet<{ pendiente: boolean; nota: NotaRecibida | null }>(`${BASE}/recibidas/${encodeURIComponent(id)}`),
  recibir: (cuerpo: Record<string, unknown>) => enviar<{ nota_id: string; numero: string; repetida: boolean }>(`${BASE}/recibidas`, cuerpo),
  devolver: (id: string, lineas: { linea_id: string; qty: number }[], clave: string) =>
    enviar<{ devolucion_id: string; total: number }>(`${BASE}/recibidas/${encodeURIComponent(id)}/devolver`, { lineas, clave_idempotencia: clave }),
  liquidar: (id: string, cuerpo: { clave_idempotencia: string; descontar_derechos?: boolean; acuerdo?: string | null }) =>
    enviar<{
      liquidacionId: string;
      estado: 'liquidada';
      porPagar: number;
      remuneracion: number;
      derechosDescontados: number;
      remuneracionPorDevengar: number;
      retenciones: RetencionLiquidacion[];
      facturaRemuneracion: boolean;
    }>(
      `${BASE}/recibidas/${encodeURIComponent(id)}/liquidar`,
      cuerpo,
    ),
  anularLiquidacion: (liquidacionId: string, motivo: string) =>
    enviar<{ estado: 'anulada' }>(`${BASE}/recibidas/liquidaciones/${encodeURIComponent(liquidacionId)}/anular`, { motivo }),
  reconocer: (id: string, cuerpo: { evidencia: string; clave_idempotencia: string }) =>
    enviar<{ reconocimiento_id: string; monto: number }>(`${BASE}/recibidas/${encodeURIComponent(id)}/reconocer`, cuerpo),
  conciliarRetencion: (retencionId: string, cuerpo: { valor: number; soporte: string }) =>
    enviar<{ retencion_id: string; valor: number }>(`${BASE}/recibidas/retenciones/${encodeURIComponent(retencionId)}/conciliar`, cuerpo),
  /**
   * Ronda 4: la retención practicada se reconoce cuando ocurre, sin esperar el certificado. Ronda 5: la de la operación
   * va con la factura y el cobro en que el comprador la practicó (`factura_id`, `cobro_id`).
   */
  registrarRetencionPracticada: (
    retencionId: string,
    cuerpo: { valor: number; base: number; fecha: string; soporte: string; factura_id?: string | null; cobro_id?: string | null },
  ) =>
    enviar<{ retencion_id: string; valor: number }>(`${BASE}/recibidas/retenciones/${encodeURIComponent(retencionId)}/practicada`, cuerpo),
  retenciones: () =>
    leerGet<{ pendiente: boolean; reglas: ReglasRetencionConsignacion; disponibles: { id: string; nombre: string; tarifa: number; clase: ClaseRetencion | null }[] }>(
      `${BASE}/retenciones`,
    ),
  configurarRetenciones: (reglas: ReglasRetencionConsignacion) => enviar<ReglasRetencionConsignacion>(`${BASE}/retenciones`, reglas),
  novedad: (id: string, cuerpo: Record<string, unknown>) =>
    enviar<{ novedad_id: string; custodia: number }>(`${BASE}/recibidas/${encodeURIComponent(id)}/novedad`, cuerpo),
  anticipos: (id: string) => leerGet<{ id: string; saldo: number; cuenta: string; creado: string }[]>(`${BASE}/recibidas/${encodeURIComponent(id)}/anticipos`),
  cruzarAnticipo: (id: string, cuerpo: { anticipo_id: string; monto: number; clave_idempotencia: string }) =>
    enviar<{ cruce_id: string; monto: number; saldo_anticipo: number }>(`${BASE}/recibidas/${encodeURIComponent(id)}/anticipos`, cuerpo),
  cuentas: () =>
    leerGet<{ pendiente: boolean; orden: string | null; contra: string | null; remuneracion: string | null; estimatorioHabilitado: boolean }>(`${BASE}/cuentas`),
  configurarCuentas: (cuerpo: { orden?: string | null; contra: string; remuneracion?: string | null }) =>
    enviar<{ orden: string | null; contra: string; remuneracion: string | null }>(`${BASE}/cuentas`, cuerpo),
  documento: (id: string) =>
    leerGet<{ documento: DocumentoPorAceptar & { estado: string }; comparacion: ComparacionDocumento | null }>(`${BASE}/por-aceptar/${encodeURIComponent(id)}`),
  aceptarNota: (id: string, cuerpo: Record<string, unknown>) =>
    enviar<{ nota_id: string; numero: string }>(`${BASE}/por-aceptar/${encodeURIComponent(id)}/aceptar`, cuerpo),
  aceptarLiquidacion: (id: string, clave: string) =>
    enviar<{ estado: string; facturaNumero: string | null }>(`${BASE}/por-aceptar/${encodeURIComponent(id)}/aceptar?tipo=liquidacion`, { clave_idempotencia: clave }),
  responder: (id: string, accion: 'rechazar' | 'anular', motivo: string) =>
    enviar<{ estado: string }>(`${BASE}/por-aceptar/${encodeURIComponent(id)}/responder`, { accion, motivo }),
  invitar: (cuerpo: { proveedor_id?: number | null; cliente_id?: string | null; correo: string }) =>
    enviar<{ vinculoId: string; vence: string; enlace: string }>('/api/vinculos', { ...cuerpo, propositos: ['consignacion'] }),
  verInvitacion: (token: string) =>
    enviar<{ estado: 'pendiente' | 'invalida' | 'vencida'; invita?: { nombre?: string; nit?: string }; vence?: string; creada?: string; organizaciones?: { id: number; nombre: string }[] }>(
      '/api/vinculos/invitacion',
      { token },
    ),
  aceptarVinculo: (cuerpo: { token: string; organizacion_id: number; proveedor_id?: number | null; cliente_id?: string | null }) =>
    enviar<{ estado: 'activo' }>('/api/vinculos/aceptar', cuerpo),
  rechazarVinculo: (token: string, motivo: string | null) => enviar<{ estado: 'rechazado' }>('/api/vinculos/rechazar', { token, motivo }),
};
