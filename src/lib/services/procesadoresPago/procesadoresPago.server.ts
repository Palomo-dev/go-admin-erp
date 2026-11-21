/**
 * Procesadores de pago — servicio de servidor (Figma «07 Finanzas» 2704:150133).
 *
 * - Saldos, abonos y bancos: cliente de la SESIÓN (RLS y permisos en las funciones:
 *   `fn_procesadores_pago_saldos` exige finance.view; registrar y configurar,
 *   finance.create; anular, finance.void).
 * - Datos de fábrica de cada procesador (NIT, origen, retención) y si la
 *   organización es responsable de IVA: funciones de solo lectura que no están
 *   abiertas a `authenticated`; se leen con el cliente de servicio y SIEMPRE con la
 *   organización de la sesión (`ctx.organizationId`), ya validada por `withOrg`.
 *
 * Toda la contabilidad la hacen las funciones de la base: aquí no se calcula ni se
 * escribe ningún asiento.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import {
  codigoDeError,
  esCodigoProcesador,
  type AbonoProcesador,
  type CodigoErrorProcesador,
  type CodigoProcesador,
  type CuentaBancaria,
  type DatosProcesador,
  type OrigenProcesador,
  type RespuestaProcesadores,
  type SaldoProcesador,
  type TratamientoIva,
} from '@/lib/finanzas/procesadoresPago/procesadoresLogica';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'supabase'>;

export class ErrorProcesadores extends Error {
  constructor(
    public readonly codigo: CodigoErrorProcesador,
    mensaje?: string,
  ) {
    super(mensaje ?? codigo);
  }
}

/** Estado HTTP de un error de la base: permiso → 403, dato del usuario → 422, lo demás → 500. */
export function estadoDeError(codigo: CodigoErrorProcesador): number {
  if (codigo === 'SIN_PERMISO' || codigo === 'SESION_REQUERIDA') return 403;
  if (codigo === 'ABONO_INEXISTENTE') return 404;
  return codigo === 'DESCONOCIDO' ? 500 : 422;
}

function lanzar(error: { message?: string } | null): never {
  const mensaje = error?.message ?? '';
  throw new ErrorProcesadores(codigoDeError(mensaje), mensaje);
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0)) || 0;
const MAX_ABONOS = 200;

async function hoy(ctx: Ctx): Promise<string> {
  const { data, error } = await ctx.supabase.rpc('fn_today_for', { p_organization_id: ctx.organizationId, p_branch_id: null });
  if (error || typeof data !== 'string') lanzar(error);
  return data as string;
}

async function leerSaldos(ctx: Ctx, mes: string | null): Promise<SaldoProcesador[]> {
  const { data, error } = await ctx.supabase.rpc('fn_procesadores_pago_saldos', {
    p_organization_id: ctx.organizationId,
    p_mes: mes,
  });
  if (error) lanzar(error);
  return ((data ?? []) as Record<string, unknown>[])
    .filter((s) => esCodigoProcesador(s.procesador))
    .map((s) => ({
      ...(s as unknown as SaldoProcesador),
      cobrado_mes: num(s.cobrado_mes),
      abonado_mes: num(s.abonado_mes),
      saldo: num(s.saldo),
      dias_habiles_sin_abono: s.dias_habiles_sin_abono === null || s.dias_habiles_sin_abono === undefined ? null : num(s.dias_habiles_sin_abono),
      dias_sin_retiro: s.dias_sin_retiro === null || s.dias_sin_retiro === undefined ? null : num(s.dias_sin_retiro),
    }));
}

async function leerDatosProcesadores(ctx: Ctx, servicio: SupabaseClient): Promise<DatosProcesador[]> {
  const [catalogo, propios] = await Promise.all([
    servicio.rpc('fn_procesadores_pago_catalogo'),
    ctx.supabase
      .from('payment_processor_settings')
      .select('processor, tercero_nit, tercero_nombre')
      .eq('organization_id', ctx.organizationId),
  ]);
  if (catalogo.error) lanzar(catalogo.error);
  if (propios.error) lanzar(propios.error);
  const porCodigo = new Map(
    ((propios.data ?? []) as { processor: string; tercero_nit: string | null; tercero_nombre: string | null }[]).map((p) => [p.processor, p]),
  );
  const filas = ((catalogo.data ?? []) as { codigo: string; nombre: string; cuenta: string }[]).filter((k) => esCodigoProcesador(k.codigo));
  return Promise.all(
    filas.map(async (k) => {
      const [tercero, pref] = await Promise.all([
        servicio.rpc('fn_procesador_pago_por_cuenta', { p_organization_id: ctx.organizationId, p_cuenta: k.cuenta }),
        servicio.rpc('fn_procesador_pago_preferencias', { p_organization_id: ctx.organizationId, p_procesador: k.codigo }),
      ]);
      if (tercero.error) lanzar(tercero.error);
      if (pref.error) lanzar(pref.error);
      const t = ((tercero.data ?? []) as { nit: string | null; nombre: string }[])[0];
      const p = ((pref.data ?? []) as { origen: OrigenProcesador; retiene_saldo: boolean }[])[0];
      const propio = porCodigo.get(k.codigo);
      const nitPropio = propio?.tercero_nit?.trim() || null;
      return {
        codigo: k.codigo as CodigoProcesador,
        cuenta: k.cuenta,
        etiqueta: k.nombre,
        nit: t?.nit ?? null,
        nombre: t?.nombre ?? k.nombre,
        nitPropio,
        nombrePropio: propio?.tercero_nombre?.trim() || null,
        nitDeFabrica: !nitPropio && !!t?.nit,
        origen: p?.origen ?? 'nacional',
        retieneSaldo: !!p?.retiene_saldo,
      };
    }),
  );
}

async function leerAbonos(ctx: Ctx): Promise<AbonoProcesador[]> {
  const { data, error } = await ctx.supabase
    .from('payment_processor_payouts')
    .select(
      'id, processor, payout_date, gross_amount, commission, commission_vat, withholding_income, withholding_vat, withholding_ica, net_amount, bank_account_id, bank_account_code, reference, commission_invoice, vat_treatment, status, journal_entry_id',
    )
    .eq('organization_id', ctx.organizationId)
    .order('payout_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(MAX_ABONOS);
  if (error) lanzar(error);
  return ((data ?? []) as Record<string, unknown>[])
    .filter((a) => esCodigoProcesador(a.processor))
    .map((a) => ({
      id: String(a.id),
      procesador: a.processor as CodigoProcesador,
      fecha: String(a.payout_date),
      bruto: num(a.gross_amount),
      comision: num(a.commission),
      ivaComision: num(a.commission_vat),
      retenciones: num(a.withholding_income) + num(a.withholding_vat) + num(a.withholding_ica),
      neto: num(a.net_amount),
      cuentaBancariaId: a.bank_account_id === null ? null : num(a.bank_account_id),
      cuentaBanco: String(a.bank_account_code ?? ''),
      referencia: (a.reference as string | null) ?? null,
      factura: (a.commission_invoice as string | null) ?? null,
      tratamientoIva: (a.vat_treatment as TratamientoIva | null) ?? null,
      estado: a.status === 'anulado' ? 'anulado' : 'registrado',
      asiento: a.journal_entry_id === null || a.journal_entry_id === undefined ? null : num(a.journal_entry_id),
    }));
}

async function leerBancos(ctx: Ctx): Promise<CuentaBancaria[]> {
  const { data, error } = await ctx.supabase
    .from('bank_accounts')
    .select('id, name, bank_name, account_number, account_code')
    .eq('organization_id', ctx.organizationId)
    .eq('is_active', true)
    .order('name');
  if (error) lanzar(error);
  return ((data ?? []) as { id: number; name: string; bank_name: string | null; account_number: string | null; account_code: string | null }[]).map((b) => ({
    id: b.id,
    nombre: b.name,
    banco: b.bank_name,
    final: b.account_number ? b.account_number.replace(/\D/g, '').slice(-4) || null : null,
    cuenta: b.account_code,
  }));
}

export async function resumenProcesadores(ctx: Ctx, mes: string | null): Promise<RespuestaProcesadores> {
  const servicio = getServiceClient();
  const fecha = await hoy(ctx);
  const [saldos, procesadores, abonos, bancos, resp] = await Promise.all([
    leerSaldos(ctx, mes),
    leerDatosProcesadores(ctx, servicio),
    leerAbonos(ctx),
    leerBancos(ctx),
    servicio.rpc('fn_org_responsable_iva', { p_organization_id: ctx.organizationId, p_fecha: fecha }),
  ]);
  if (resp.error) lanzar(resp.error);
  return {
    mes: saldos[0]?.mes ?? mes ?? `${fecha.slice(0, 7)}-01`,
    saldos,
    procesadores,
    abonos,
    bancos,
    responsableIva: typeof resp.data === 'boolean' ? resp.data : null,
  };
}

export interface EntradaConfigurar {
  procesador: CodigoProcesador;
  nit?: string | null;
  nombre?: string | null;
  origen?: OrigenProcesador | null;
  retiene_saldo?: boolean | null;
}

export async function configurarProcesador(ctx: Ctx, entrada: EntradaConfigurar) {
  const { data, error } = await ctx.supabase.rpc('fn_procesador_pago_configurar', {
    p_organization_id: ctx.organizationId,
    p_datos: entrada,
  });
  if (error) lanzar(error);
  return data as Record<string, unknown>;
}

export interface EntradaAbono {
  solicitud: string;
  procesador: CodigoProcesador;
  fecha: string;
  bruto: number;
  neto: number;
  comision: number;
  iva_comision: number;
  retencion_fuente: number;
  retencion_iva: number;
  retencion_ica: number;
  cuenta_bancaria: number | null;
  factura_comision: string | null;
  referencia: string | null;
  notas: string | null;
}

export async function registrarAbono(ctx: Ctx, entrada: EntradaAbono) {
  const { data, error } = await ctx.supabase.rpc('fn_procesador_abono_registrar', {
    p_organization_id: ctx.organizationId,
    p_datos: entrada,
  });
  if (error) lanzar(error);
  return data as Record<string, unknown>;
}

export async function anularAbono(ctx: Ctx, abonoId: string, motivo: string) {
  // El abono tiene que ser de la organización de la sesión antes de tocarlo.
  const { data: abono, error: errLectura } = await ctx.supabase
    .from('payment_processor_payouts')
    .select('id')
    .eq('id', abonoId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (errLectura) lanzar(errLectura);
  if (!abono) throw new ErrorProcesadores('ABONO_INEXISTENTE');
  const { data, error } = await ctx.supabase.rpc('fn_procesador_abono_anular', { p_abono_id: abonoId, p_motivo: motivo });
  if (error) lanzar(error);
  return data as Record<string, unknown>;
}
