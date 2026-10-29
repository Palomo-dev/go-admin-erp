import { supabase } from '@/lib/supabase/config';
import { esColumnaAusente, normalizarCodigosMetodo, normalizarSucursales, seleccionarConColumnaOpcional } from '@/lib/finanzas/metodosPagoAlcance';
import { nombreVisibleMetodo } from '@/lib/finanzas/metodosPagoOrganizacion';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { 
  Promotion, 
  PromotionRule,
  CreatePromotionData, 
  UpdatePromotionData,
  PromotionFilters,
  CreatePromotionRuleData,
  WeekDay
} from './types';

import { resolveTimezone } from '@/lib/services/timezoneResolver';
import { toPlainDate, plainDateToInstant } from '@/lib/utils/dateCore';
import { getDayRange } from '@/lib/utils/dateRanges';
import { avisarCambioPromociones } from '@/lib/pos/venta/avisosPromociones';
import { copiaDePromocion } from '@/lib/promotions/cantidadMinima';
import { cantidadDeRegla, prepararPromocion } from '@/lib/promotions/prepararPromocion';
import { conflictosSolapados, type ProductoCatalogo, type PromoSolape } from '@/lib/promotions/solapamiento';

// ============================================================
// Vigencias en zona de la organizacion (Fase B, tanda 4).
//
// `promotions.start_date` y `.end_date` son **timestamptz**, no `date`
// (verificado en `information_schema.columns`). El formulario entrega
// 'YYYY-MM-DD' y Postgres lo lee a medianoche del `TimeZone` de la sesion
// (UTC). El motor que decide si una promocion esta vigente compara INSTANTES
// (`lte('start_date', ahora)` y el predicado de `end_date`), asi que una
// vigencia "del 1 al 30" empezaba en Bogota a las 19:00 del 31 anterior y se
// apagaba a las 19:00 del 29: un dia de descuento perdido por cada extremo.
//
// Regla: el dia de inicio empieza a las 00:00 de la zona de la organizacion y
// el dia de fin termina a las 23:59:59.999 de esa misma zona.
// ============================================================

/** Dia calendario 'YYYY-MM-DD' de un valor que puede venir ya como instante. */
function diaDe(valor: string, timezone: string): string {
  return valor.length <= 10 ? valor : toPlainDate(new Date(valor), timezone);
}

/**
 * Vacía horas en blanco y un precio de paquete en 0, para no guardar `''`
 * en una columna `time` ni un 0 que el motor tomaría como «sin precio».
 */
function limpiarFranjaYPaquete<T extends Partial<CreatePromotionData>>(datos: T): T {
  const out = { ...datos };
  const hora = (valor: string | null | undefined): string | null => {
    if (valor == null || String(valor).trim() === '') return null;
    const texto = String(valor).trim();
    // Una hora a medio escribir no puede guardarse como «todo el día» en silencio.
    if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(texto)) {
      throw new Error(`Hora inválida en la franja: «${texto}». Usa HH:mm (24 h).`);
    }
    return texto;
  };
  if ('start_time' in out) out.start_time = hora(out.start_time);
  if ('end_time' in out) out.end_time = hora(out.end_time);
  if ('bundle_price' in out) {
    const n = Number(out.bundle_price);
    out.bundle_price = Number.isFinite(n) && n > 0 ? n : null;
  }
  if ('branches' in out && Array.isArray(out.branches) && out.branches.length === 0) {
    out.branches = undefined;
  }
  // Métodos de pago (20261028180000): lista vacía = cualquiera = NULL.
  if ('payment_method_codes' in out) {
    out.payment_method_codes = normalizarCodigosMetodo(out.payment_method_codes);
  }
  return out;
}

/**
 * Escribe la promoción con `payment_method_codes`; si la columna todavía no
 * existe (migración sin aplicar) y no hay restricción, repite sin ella. Con
 * restricción, avisa en lugar de guardar algo que no se cumpliría.
 */
export async function conMetodosPagoOpcionales<T extends Record<string, unknown>, R extends { error: unknown }>(
  fila: T,
  escribir: (fila: T) => PromiseLike<R>,
): Promise<R> {
  const r = await escribir(fila);
  if (!('payment_method_codes' in fila) || !r.error || !esColumnaAusente(r.error, 'payment_method_codes')) return r;
  const { payment_method_codes: codigos, ...sinCodigos } = fila;
  if (codigos != null) {
    throw new Error('La restricción por método de pago todavía no está habilitada en la base de datos. Deja «Cualquier método» o pide aplicar la migración.');
  }
  return await escribir(sinCodigos as T);
}

/** Convierte los dias del formulario en los instantes que van a la columna. */
async function vigenciaEnInstantes(
  organizationId: number,
  datos: { start_date?: string | null; end_date?: string | null },
): Promise<Record<string, string | null>> {
  const zona = await resolveTimezone(organizationId);
  const convertido: Record<string, string | null> = {};
  if (datos.start_date) {
    convertido.start_date = plainDateToInstant(diaDe(datos.start_date, zona), zona, '00:00');
  }
  if (datos.end_date) {
    convertido.end_date = getDayRange(diaDe(datos.end_date, zona), zona).end;
  }
  return convertido;
}

export class PromotionsService {
  private static getOrganizationId(): number {
    const org = obtenerOrganizacionActiva();
    return org.id;
  }

  /**
   * Edición masiva de días y franja horaria. Solo toca las promociones de la
   * organización activa (`organization_id`, además del RLS) y solo las
   * columnas pedidas: `undefined` = no cambiar ese campo. Días vacíos o
   * `null` = todos los días; franja `{ null, null }` = todo el día.
   * Devuelve cuántas filas cambió la base.
   */
  static async updateHorarioMasivo(
    ids: string[],
    cambios: {
      applicable_days?: WeekDay[] | null;
      franja?: { start_time: string | null; end_time: string | null };
    },
  ): Promise<number> {
    const unicos = Array.from(new Set(ids.filter(Boolean)));
    if (unicos.length === 0) return 0;
    const fila: Record<string, unknown> = {};
    if (cambios.applicable_days !== undefined) {
      fila.applicable_days = cambios.applicable_days && cambios.applicable_days.length > 0 ? cambios.applicable_days : null;
    }
    if (cambios.franja !== undefined) {
      const limpia = limpiarFranjaYPaquete({ start_time: cambios.franja.start_time, end_time: cambios.franja.end_time });
      fila.start_time = limpia.start_time ?? null;
      fila.end_time = limpia.end_time ?? null;
    }
    if (Object.keys(fila).length === 0) return 0;
    const organizationId = this.getOrganizationId();
    const { data, error } = await supabase
      .from('promotions')
      .update({ ...fila, updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .in('id', unicos)
      .select('id');
    if (error) {
      console.error('Error en edición masiva de horario:', error);
      throw new Error(`Error al actualizar las promociones: ${error.message}`);
    }
    avisarCambioPromociones();
    return Array.isArray(data) ? data.length : 0;
  }

  /**
   * Obtener todas las promociones
   */
  static async getAll(filters: PromotionFilters = {}): Promise<Promotion[]> {
    try {
      const organizationId = this.getOrganizationId();
      
      let query = supabase
        .from('promotions')
        .select(`
          *,
          promotion_rules (
            id,
            rule_type,
            product_id,
            category_id,
            quantity,
            created_at
          )
        `)
        .eq('organization_id', organizationId)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters.search) {
        query = query.ilike('name', `%${filters.search}%`);
      }

      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      if (filters.promotion_type) {
        query = query.eq('promotion_type', filters.promotion_type);
      }

      if (filters.dateFrom) {
        query = query.gte('start_date', filters.dateFrom);
      }

      if (filters.dateTo) {
        query = query.lte('end_date', filters.dateTo);
      }

      // Filtro de sucursal: mostrar promociones globales (branches null/vacío)
      // y promociones que incluyen la sucursal seleccionada en su array branches.
      // OJO: branches es JSONB, no un array de Postgres. El operador `cs` (@>)
      // debe recibir el valor como JSON (`[117]`), no como array literal
      // (`{117}`), o Postgres falla con 22P02 "invalid input syntax for type json".
      if (filters.branchId != null) {
        query = query.or(`branches.is.null,branches.eq.[],branches.cs.[${filters.branchId}]`);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching promotions:', error);
        throw new Error(`Error al obtener promociones: ${error.message}`);
      }

      return (data || []).map(promo => ({
        ...promo,
        rules: promo.promotion_rules || []
      }));
    } catch (error) {
      console.error('Error in getAll:', error);
      throw error;
    }
  }

  /**
   * Obtener promoción por ID
   */
  static async getById(id: string): Promise<Promotion | null> {
    try {
      const organizationId = this.getOrganizationId();

      const { data, error } = await supabase
        .from('promotions')
        .select(`
          *,
          promotion_rules (
            id,
            rule_type,
            product_id,
            category_id,
            quantity,
            created_at
          )
        `)
        .eq('id', id)
        .eq('organization_id', organizationId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw new Error(`Error al obtener promoción: ${error.message}`);
      }

      // Obtener productos y categorías relacionados
      const rules = data.promotion_rules || [];
      const productIds = rules.filter((r: any) => r.product_id).map((r: any) => r.product_id);
      const categoryIds = rules.filter((r: any) => r.category_id).map((r: any) => r.category_id);

      let products: any[] = [];
      let categories: any[] = [];

      if (productIds.length > 0) {
        const { data: prods } = await supabase
          .from('products')
          .select('id, name, sku')
          .in('id', productIds);
        products = prods || [];
      }

      if (categoryIds.length > 0) {
        const { data: cats } = await supabase
          .from('categories')
          .select('id, name')
          .in('id', categoryIds);
        categories = cats || [];
      }

      return {
        ...data,
        rules: rules.map((rule: any) => ({
          ...rule,
          product: products.find(p => p.id === rule.product_id),
          category: categories.find(c => c.id === rule.category_id)
        }))
      };
    } catch (error) {
      console.error('Error in getById:', error);
      throw error;
    }
  }

  /**
   * Crear promoción
   */
  static async create(data: CreatePromotionData): Promise<Promotion> {
    try {
      const organizationId = this.getOrganizationId();
      const { data: userData } = await supabase.auth.getUser();

      const { rules, ...promotionData } = data;
      const limpia = prepararPromocion(limpiarFranjaYPaquete(promotionData));
      const vigencia = await vigenciaEnInstantes(organizationId, limpia);

      const { data: result, error } = await conMetodosPagoOpcionales(limpia, (fila) => supabase
        .from('promotions')
        .insert([{
          ...fila,
          ...vigencia,
          organization_id: organizationId,
          created_by: userData?.user?.id,
          is_active: data.is_active ?? true,
          is_combinable: data.is_combinable ?? false,
          priority: data.priority ?? 0,
          usage_count: 0
        }])
        .select()
        .single());

      if (error) {
        console.error('Error creating promotion:', error);
        throw new Error(`Error al crear promoción: ${error.message}`);
      }

      // Crear reglas si existen
      if (rules && rules.length > 0) {
        await this.createRules(result.id, rules, data.promotion_type);
      }

      avisarCambioPromociones();
      return result;
    } catch (error) {
      console.error('Error in create:', error);
      throw error;
    }
  }

  /**
   * Actualizar promoción
   */
  static async update(id: string, data: UpdatePromotionData): Promise<Promotion> {
    try {
      const organizationId = this.getOrganizationId();
      const { rules, ...promotionData } = data;
      const limpia = prepararPromocion(limpiarFranjaYPaquete(promotionData));
      const vigencia = await vigenciaEnInstantes(organizationId, limpia);

      const { data: result, error } = await conMetodosPagoOpcionales(limpia, (fila) => supabase
        .from('promotions')
        .update({
          ...fila,
          ...vigencia,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('organization_id', organizationId)
        .select()
        .single());

      if (error) {
        console.error('Error updating promotion:', error);
        throw new Error(`Error al actualizar promoción: ${error.message}`);
      }

      // Actualizar reglas si se proporcionan
      if (rules !== undefined) {
        // Eliminar reglas existentes
        await supabase
          .from('promotion_rules')
          .delete()
          .eq('promotion_id', id);

        // Crear nuevas reglas
        if (rules.length > 0) {
          await this.createRules(id, rules, data.promotion_type);
        }
      }

      avisarCambioPromociones();
      return result;
    } catch (error) {
      console.error('Error in update:', error);
      throw error;
    }
  }

  /**
   * Crear reglas de promoción
   */
  private static async createRules(
    promotionId: string,
    rules: CreatePromotionRuleData[],
    tipo?: string,
  ): Promise<void> {
    const rulesData = rules.map(rule => ({
      promotion_id: promotionId,
      rule_type: rule.rule_type,
      product_id: rule.product_id || null,
      category_id: rule.category_id || null,
      quantity: cantidadDeRegla(rule, tipo),
    }));

    const { error } = await supabase
      .from('promotion_rules')
      .insert(rulesData);

    if (error) {
      console.error('Error creating promotion rules:', error);
      throw new Error(`Error al crear reglas: ${error.message}`);
    }
  }

  /**
   * Eliminar promoción
   */
  static async delete(id: string): Promise<void> {
    try {
      const organizationId = this.getOrganizationId();

      // Eliminar reglas primero
      await supabase
        .from('promotion_rules')
        .delete()
        .eq('promotion_id', id);

      const { error } = await supabase
        .from('promotions')
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId);

      if (error) {
        console.error('Error deleting promotion:', error);
        throw new Error(`Error al eliminar promoción: ${error.message}`);
      }
      avisarCambioPromociones();
    } catch (error) {
      console.error('Error in delete:', error);
      throw error;
    }
  }

  /**
   * Duplicar promoción
   */
  static async duplicate(id: string): Promise<Promotion> {
    try {
      const original = await this.getById(id);
      if (!original) throw new Error('Promoción no encontrada');

      const { id: _, created_at, updated_at, usage_count, rules, ...data } = original;
      const copia = copiaDePromocion(data);

      return this.create({
        ...copia,
        name: `${data.name} (Copia)`,
        is_active: false,
        rules: rules?.map(r => ({
          rule_type: r.rule_type,
          product_id: r.product_id,
          category_id: r.category_id,
          quantity: r.quantity,
        }))
      });
    } catch (error) {
      console.error('Error in duplicate:', error);
      throw error;
    }
  }

  /**
   * Cambiar estado activo/inactivo
   */
  static async toggleActive(id: string): Promise<Promotion> {
    const promo = await this.getById(id);
    if (!promo) throw new Error('Promoción no encontrada');
    
    return this.update(id, { is_active: !promo.is_active });
  }

  /**
   * Obtener productos para selector (con variantes agrupadas por padre)
   * Replica el patrón de purchaseOrderService.getProducts: trae variant_data,
   * mapea el nombre del padre y excluye productos padre y servicios.
   */
  /** Métodos de pago activos de la organización, con sus sucursales (para limitar la promoción). */
  static async getMetodosPago(): Promise<{ code: string; name: string; branch_ids: number[] | null }[]> {
    const organizationId = this.getOrganizationId();
    const { data, error } = await seleccionarConColumnaOpcional('organization_payment_methods', 'branch_ids', (extra) => supabase
      .from('organization_payment_methods')
      .select(`payment_method_code, settings, payment_methods!inner(name)${extra}`)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('website_display_order', { ascending: true, nullsFirst: false }));
    if (error) {
      console.error('Error loading payment methods:', error);
      return [];
    }
    type Fila = { payment_method_code: string; settings: unknown; payment_methods: { name?: string } | { name?: string }[] | null; branch_ids?: unknown };
    return ((data ?? []) as unknown as Fila[]).map((f) => {
      const pm = Array.isArray(f.payment_methods) ? f.payment_methods[0] : f.payment_methods;
      return {
        code: f.payment_method_code,
        name: nombreVisibleMetodo(f.settings, pm?.name, f.payment_method_code),
        branch_ids: normalizarSucursales(f.branch_ids),
      };
    });
  }

  static async getBranches(): Promise<{ id: number; name: string }[]> {
    const organizationId = this.getOrganizationId();
    const { data, error } = await supabase
      .from('branches')
      .select('id, name')
      .eq('organization_id', organizationId)
      .or('is_active.is.null,is_active.eq.true')
      .order('name');
    if (error) {
      console.error('Error loading branches:', error);
      return [];
    }
    return (data || []).map((fila) => ({ id: fila.id, name: fila.name }));
  }

  static async getProducts(search?: string): Promise<any[]> {
    const organizationId = this.getOrganizationId();

    let query = supabase
      .from('products')
      .select('id, uuid, sku, name, unit_code, is_parent, parent_product_id, variant_data, categories(name)')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .neq('product_type', 'service')
      .neq('is_parent', true)
      .order('name')
      .limit(50);

    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) return [];

    // Mapear padres por parent_product_id para resolver parent_name
    const parentIds = Array.from(
      new Set(data.map((p: any) => p.parent_product_id).filter(Boolean))
    ) as number[];

    const parentMap = new Map<number, { name: string; sku: string }>();
    if (parentIds.length > 0) {
      const { data: parents } = await supabase
        .from('products')
        .select('id, name, sku')
        .in('id', parentIds);
      (parents || []).forEach((p: any) =>
        parentMap.set(p.id, { name: p.name, sku: p.sku })
      );
    }

    // Mapeo por SKU base para variantes huérfanas (sin parent_product_id)
    const skuToParent = new Map<string, string>();
    const orphanBaseSkus = data
      .filter((p: any) => !p.parent_product_id && p.variant_data)
      .map((p: any) => {
        const m = String(p.sku).match(/^(.+)-V[A-Z0-9]+/);
        return m ? m[1] : null;
      })
      .filter(Boolean) as string[];

    if (orphanBaseSkus.length > 0) {
      const { data: orphanParents } = await supabase
        .from('products')
        .select('sku, name')
        .eq('organization_id', organizationId)
        .eq('is_parent', true)
        .in('sku', orphanBaseSkus);
      (orphanParents || []).forEach((p: any) => skuToParent.set(p.sku, p.name));
    }

    return data.map((p: any) => {
      let parentName: string | null = null;
      if (p.parent_product_id && parentMap.has(p.parent_product_id)) {
        parentName = parentMap.get(p.parent_product_id)!.name;
      } else if (p.variant_data) {
        const skuMatch = String(p.sku).match(/^(.+)-V[A-Z0-9]+/);
        if (skuMatch && skuToParent.has(skuMatch[1])) {
          parentName = skuToParent.get(skuMatch[1])!;
        }
      }

      return {
        id: p.id,
        uuid: p.uuid,
        sku: p.sku,
        name: p.name,
        unit_code: p.unit_code,
        category: p.categories?.name,
        is_parent: p.is_parent,
        parent_product_id: p.parent_product_id,
        variant_data: p.variant_data,
        parent_name: parentName,
      };
    });
  }

  /**
   * Obtener categorías para selector
   */
  static async getCategories(): Promise<any[]> {
    const organizationId = this.getOrganizationId();
    
    const { data } = await supabase
      .from('categories')
      .select('id, name')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    return data || [];
  }

  /**
   * Promociones activas de la organización que se pisan con este borrador.
   * Excluye la propia al editar. Si esta es combinable, no hay aviso.
   */
  static async conflictosSolapados(
    candidata: PromoSolape,
  ): Promise<Array<{ id: string; name: string }>> {
    if (candidata.is_combinable === true || candidata.is_active === false) return [];
    const organizationId = this.getOrganizationId();
    const { data, error } = await supabase
      .from('promotions')
      .select('id, name, is_combinable, is_active, applies_to, branches, applies_to_web, applies_to_pos, applies_to_finances, start_date, end_date, applicable_days, start_time, end_time, promotion_rules(rule_type, product_id, category_id)')
      .eq('organization_id', organizationId)
      .eq('is_active', true);
    if (error || !data) return [];
    const otras = (data as PromoSolape[]).filter((p) => p.id !== candidata.id);
    const ids = new Set<number>();
    for (const promo of [candidata, ...otras]) {
      for (const regla of promo.rules ?? promo.promotion_rules ?? []) {
        if (regla.product_id != null) ids.add(Number(regla.product_id));
      }
    }
    let catalogo: ProductoCatalogo[] = [];
    if (ids.size > 0) {
      const { data: productos } = await supabase
        .from('products')
        .select('id, parent_product_id, category_id')
        .eq('organization_id', organizationId)
        .in('id', [...ids]);
      catalogo = (productos ?? []) as ProductoCatalogo[];
      const padres = [...new Set(catalogo.map((p) => p.parent_product_id).filter((id): id is number => id != null))];
      const faltan = padres.filter((id) => !catalogo.some((p) => p.id === id));
      if (faltan.length > 0) {
        const { data: filasPadre } = await supabase
          .from('products')
          .select('id, parent_product_id, category_id')
          .eq('organization_id', organizationId)
          .in('id', faltan);
        catalogo = catalogo.concat((filasPadre ?? []) as ProductoCatalogo[]);
      }
    }
    return conflictosSolapados(candidata, otras, catalogo).map((p) => ({ id: p.id, name: p.name }));
  }
}
