import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { resolveTimezone } from '@/lib/services/timezoneResolver';
import { toPlainDate, plainDateToInstant } from '@/lib/utils/dateCore';
import { getDayRange } from '@/lib/utils/dateRanges';
import { CuponError, cambiosCupon, codigoAlAzar, errorCupon, normalizarPrefijo } from './cuponesVista';
import type {
  CanjesCupon,
  Coupon,
  CreateCouponData,
  DatosLote,
  FiltroEstadoCupon,
  ListadoCupones,
  LoteCreado,
  ResumenCupones,
  UpdateCouponData,
} from './types';

// ============================================================
// Vigencias en la zona de la organización.
//
// `coupons.start_date` y `.end_date` son timestamptz. El formulario entrega
// días 'YYYY-MM-DD': el día de inicio empieza a las 00:00 de la zona de la
// organización y el de fin termina a las 23:59:59.999 de esa misma zona
// («El último día cuenta entero», Figma 458:83786).
// ============================================================

/** Día calendario 'YYYY-MM-DD' de un valor que puede venir ya como instante. */
function diaDe(valor: string, timezone: string): string {
  return valor.length <= 10 ? valor : toPlainDate(new Date(valor), timezone);
}

async function vigenciaEnInstantes(
  organizationId: number,
  datos: { start_date?: string | null; end_date?: string | null },
): Promise<Record<string, string | null>> {
  const zona = await resolveTimezone(organizationId);
  const convertido: Record<string, string | null> = {};
  if ('start_date' in datos) {
    convertido.start_date = datos.start_date ? plainDateToInstant(diaDe(datos.start_date, zona), zona, '00:00') : null;
  }
  if ('end_date' in datos) {
    convertido.end_date = datos.end_date ? getDayRange(diaDe(datos.end_date, zona), zona).end : null;
  }
  return convertido;
}

// `estado_codigo`: columna calculada (fn_cupon_estado), la misma regla de la lista.
const SELECT_CUPON = `
  *,
  estado_codigo,
  customer:customers ( id, full_name, email ),
  promotion:promotions ( id, name )
`;

/**
 * Cupones del POS. Lectura por RPC (`pos_cupones_listar`, `pos_cupones_resumen`,
 * `pos_cupon_canjes`: estado y KPI calculados en la base, con la RLS de la
 * sesión). Escritura acotada a la organización de la sesión; el trigger
 * `trg_coupons_guarda` exige `pos.cupones.gestionar` y guarda el código en
 * mayúsculas. «Crear lote» es una sola transacción en el servidor.
 *
 * No valida canjes: eso lo hacen el POS (`POSService.aplicarCupon` →
 * `validarCupon`) y la tienda web.
 */
export class CouponsService {
  static async listar(params: {
    branchId?: number | null;
    busqueda?: string;
    estado?: FiltroEstadoCupon;
    limite: number;
    desplazamiento: number;
  }): Promise<ListadoCupones> {
    const { data, error } = await supabase.rpc('pos_cupones_listar', {
      p_organization_id: getOrganizationId(),
      p_branch_id: params.branchId ?? null,
      p_busqueda: params.busqueda?.trim() || null,
      p_estado: params.estado ?? 'todos',
      p_limite: params.limite,
      p_desplazamiento: params.desplazamiento,
    });
    if (error) throw errorCupon(error);
    const r = (data ?? { total: 0, filas: [] }) as ListadoCupones;
    return { total: Number(r.total) || 0, filas: r.filas ?? [] };
  }

  /** KPI de la lista. `desde`/`hasta`: instantes del mes de la organización. */
  static async resumen(params: { branchId?: number | null; desde: string; hasta: string }): Promise<ResumenCupones> {
    const { data, error } = await supabase.rpc('pos_cupones_resumen', {
      p_organization_id: getOrganizationId(),
      p_branch_id: params.branchId ?? null,
      p_desde: params.desde,
      p_hasta: params.hasta,
    });
    if (error) throw errorCupon(error);
    const r = (data ?? {}) as Partial<ResumenCupones>;
    return {
      total: Number(r.total) || 0,
      activos: Number(r.activos) || 0,
      agotados_o_vencidos: Number(r.agotados_o_vencidos) || 0,
      con_canje: Number(r.con_canje) || 0,
      canjes: Number(r.canjes) || 0,
      descuento: Number(r.descuento) || 0,
    };
  }

  static async canjes(couponId: string, limite: number, desplazamiento: number): Promise<CanjesCupon> {
    const { data, error } = await supabase.rpc('pos_cupon_canjes', {
      p_organization_id: getOrganizationId(),
      p_coupon_id: couponId,
      p_limite: limite,
      p_desplazamiento: desplazamiento,
    });
    if (error) throw errorCupon(error);
    return data as CanjesCupon;
  }

  static async getById(id: string): Promise<Coupon | null> {
    const { data, error } = await supabase
      .from('coupons')
      .select(SELECT_CUPON)
      .eq('id', id)
      .eq('organization_id', getOrganizationId())
      .maybeSingle();
    if (error) throw errorCupon(error);
    return (data as Coupon | null) ?? null;
  }

  static async create(datos: CreateCouponData): Promise<Coupon> {
    const organizationId = getOrganizationId();
    const fila = {
      ...cambiosCupon(datos),
      ...(await vigenciaEnInstantes(organizationId, { start_date: datos.start_date ?? null, end_date: datos.end_date ?? null })),
      organization_id: organizationId,
      usage_count: 0,
    };
    const { data, error } = await supabase.from('coupons').insert(fila).select().single();
    if (error) throw errorCupon(error);
    return data as Coupon;
  }

  /** Las claves presentes y vacías viajan como null: así se vacían campos al editar. */
  static async update(id: string, datos: UpdateCouponData): Promise<Coupon> {
    const organizationId = getOrganizationId();
    const fechas: { start_date?: string | null; end_date?: string | null } = {};
    if ('start_date' in datos) fechas.start_date = datos.start_date ?? null;
    if ('end_date' in datos) fechas.end_date = datos.end_date ?? null;
    const cambios = { ...cambiosCupon(datos), ...(await vigenciaEnInstantes(organizationId, fechas)) };
    return this.escribir(id, cambios);
  }

  static async setActivo(id: string, activo: boolean): Promise<Coupon> {
    return this.escribir(id, { is_active: activo });
  }

  /** Reemplaza al borrado físico, que se llevaba el historial de canjes (ON DELETE CASCADE). */
  static async archive(id: string): Promise<Coupon> {
    return this.escribir(id, { archived_at: new Date().toISOString(), is_active: false });
  }

  /** Sale del archivo inactivo: activarlo es otra decisión. */
  static async restore(id: string): Promise<Coupon> {
    return this.escribir(id, { archived_at: null });
  }

  /** Copia con un código nuevo al azar (antes `_COPIA` fijo, que chocaba al duplicar dos veces). */
  static async duplicate(id: string): Promise<Coupon> {
    const original = await this.getById(id);
    if (!original) throw new CuponError('NO_ENCONTRADO');
    const prefijo = normalizarPrefijo(original.code.split('-')[0] || original.code);
    for (let intento = 0; intento < 3; intento++) {
      try {
        const { data, error } = await supabase
          .from('coupons')
          .insert({
            organization_id: getOrganizationId(),
            code: codigoAlAzar(prefijo),
            name: original.name ?? null,
            discount_type: original.discount_type,
            discount_value: original.discount_value,
            min_purchase_amount: original.min_purchase_amount ?? null,
            max_discount_amount: original.max_discount_amount ?? null,
            usage_limit: original.usage_limit ?? null,
            usage_limit_per_customer: original.usage_limit_per_customer ?? null,
            start_date: original.start_date ?? null,
            end_date: original.end_date ?? null,
            applies_to_first_purchase: original.applies_to_first_purchase,
            customer_id: original.customer_id ?? null,
            promotion_id: original.promotion_id ?? null,
            usage_count: 0,
            is_active: false,
          })
          .select()
          .single();
        if (error) throw error;
        return data as Coupon;
      } catch (e) {
        if (errorCupon(e).codigo !== 'CODIGO_DUPLICADO') throw errorCupon(e);
      }
    }
    throw new CuponError('CODIGO_DUPLICADO');
  }

  /** «Crear lote»: códigos únicos generados y guardados en una sola transacción. */
  static async crearLote(datos: DatosLote): Promise<LoteCreado> {
    const organizationId = getOrganizationId();
    const vigencia = await vigenciaEnInstantes(organizationId, { start_date: datos.start_date ?? null, end_date: datos.end_date ?? null });
    const { data, error } = await supabase.rpc('pos_cupones_crear_lote', {
      p_organization_id: organizationId,
      p_prefijo: normalizarPrefijo(datos.prefijo),
      p_cantidad: datos.cantidad,
      p_datos: {
        discount_type: datos.discount_type,
        discount_value: datos.discount_value,
        max_discount_amount: datos.discount_type === 'percentage' ? datos.max_discount_amount ?? null : null,
        min_purchase_amount: datos.min_purchase_amount ?? null,
        usage_limit: datos.usage_limit ?? null,
        usage_limit_per_customer: datos.usage_limit_per_customer ?? null,
        start_date: vigencia.start_date,
        end_date: vigencia.end_date,
        promotion_id: datos.promotion_id ?? null,
      },
    });
    if (error) throw errorCupon(error);
    const r = data as LoteCreado;
    return { lote: r.lote, creados: Number(r.creados) || 0, codigos: r.codigos ?? [] };
  }

  /** Códigos de un lote ya creado (para volver a exportarlo). */
  static async codigosDelLote(batchId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('coupons')
      .select('code')
      .eq('organization_id', getOrganizationId())
      .eq('batch_id', batchId)
      .order('code')
      .limit(5000);
    if (error) throw errorCupon(error);
    return ((data ?? []) as { code: string }[]).map((c) => c.code);
  }

  static async promociones(): Promise<{ id: string; name: string }[]> {
    const { data, error } = await supabase
      .from('promotions')
      .select('id, name')
      .eq('organization_id', getOrganizationId())
      .eq('is_active', true)
      .order('name')
      .limit(200);
    if (error) throw errorCupon(error);
    return ((data ?? []) as { id: string; name: string | null }[]).map((p) => ({ id: p.id, name: p.name ?? '—' }));
  }

  /** Solo decide qué botones se ven: el trigger de la base vuelve a comprobarlo al escribir. */
  static async puedeGestionar(): Promise<boolean> {
    const { data, error } = await supabase.rpc('fn_tiene_permiso', {
      p_organization_id: getOrganizationId(),
      p_code: 'pos.cupones.gestionar',
    });
    return !error && data === true;
  }

  private static async escribir(id: string, cambios: Record<string, unknown>): Promise<Coupon> {
    const { data, error } = await supabase
      .from('coupons')
      .update(cambios)
      .eq('id', id)
      .eq('organization_id', getOrganizationId())
      .select();
    if (error) throw errorCupon(error);
    if (!data || data.length === 0) throw new CuponError('SIN_PERMISO');
    return data[0] as Coupon;
  }
}
