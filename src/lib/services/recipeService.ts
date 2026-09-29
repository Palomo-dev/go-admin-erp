import { supabase } from '@/lib/supabase/config';

export interface RecipeIngredient {
  id: number;
  recipe_id: number;
  ingredient_product_id: number;
  quantity: number;
  unit_code: string;
  is_optional: boolean;
  notes: string | null;
  sort_order: number;
  created_at: string;
  ingredient_product?: {
    id: number;
    name: string;
    sku: string;
    track_stock: boolean;
    unit_code: string | null;
  };
}

export interface ProductRecipe {
  id: number;
  organization_id: number;
  product_id: number;
  name: string | null;
  yield_qty: number;
  yield_unit_code: string | null;
  is_active: boolean;
  version: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  ingredients?: RecipeIngredient[];
  product?: {
    id: number;
    name: string;
    sku: string;
    is_composite: boolean;
    production_type: string;
  };
}

export interface CreateRecipeData {
  organization_id: number;
  product_id: number;
  name?: string;
  yield_qty?: number;
  yield_unit_code?: string;
  notes?: string;
  ingredients: {
    ingredient_product_id: number;
    quantity: number;
    unit_code: string;
    is_optional?: boolean;
    notes?: string;
    sort_order?: number;
  }[];
}

export interface UpdateRecipeData {
  name?: string;
  yield_qty?: number;
  yield_unit_code?: string;
  notes?: string;
  is_active?: boolean;
  ingredients?: {
    ingredient_product_id: number;
    quantity: number;
    unit_code: string;
    is_optional?: boolean;
    notes?: string;
    sort_order?: number;
  }[];
}

// ── Contrato de las RPC de receta ───────────────────────────────────────────

export type ModoRecetaPayload = 'al_vender' | 'al_producir';

export interface IngredientePayload {
  ingredient_product_id: number;
  quantity: number;
  unit_code: string | null;
  waste_pct: number;
  is_optional: boolean;
  notes: string | null;
}

export interface RecetaPayload {
  name: string | null;
  yield_qty: number;
  yield_unit_code: string | null;
  notes: string | null;
  ingredientes: IngredientePayload[];
}

export type DestinoRecetaPayload = 'producto' | { variante: string };

/** Clave «receta» del payload de `fn_producto_guardar`. */
export interface PayloadRecetaProducto {
  activa: boolean;
  modo: ModoRecetaPayload;
  recetas: (RecetaPayload & { destino: DestinoRecetaPayload })[];
}

export interface ResultadoGuardarReceta {
  recipe_id: number;
  version: number;
  cambio: boolean;
}

export type FuenteCosto = 'promedio_sucursal' | 'costo_vigente' | 'sin_costo';

export interface LineaCostoReceta {
  orden: number;
  ingredient_product_id: number | null;
  nombre: string | null;
  sku: string | null;
  track_stock: boolean;
  unidad_receta: string;
  unidad_ingrediente: string;
  cantidad_neta: number;
  merma_pct: number;
  cantidad_bruta: number;
  /** Receta → unidad del ingrediente; null = no hay conversión. */
  factor: number | null;
  cantidad: number;
  opcional: boolean;
  existencia: number | null;
  fuente: FuenteCosto;
  costo_unitario: number | null;
  costo_linea: number | null;
  error: 'ingrediente_invalido' | 'conversion_faltante' | null;
}

export interface CostoReceta {
  permitido: boolean;
  rinde: number;
  unidad_rinde: string | null;
  costo_tanda: number | null;
  costo_unidad: number | null;
  completo: boolean;
  lineas_sin_costo: number;
  lineas_con_error: number;
  lineas: LineaCostoReceta[];
}

/** Receta guardada tal como la devuelve `fn_receta_int_a_jsonb`. */
export interface RecetaServidor {
  recipe_id: number;
  product_id: number;
  name: string | null;
  yield_qty: number;
  yield_unit_code: string | null;
  notes: string | null;
  version: number;
  is_active: boolean;
  created_at: string | null;
  ingredientes: {
    ingredient_product_id: number;
    quantity: number;
    unit_code: string;
    waste_pct: number;
    is_optional: boolean;
    notes: string | null;
  }[];
}

export interface RecetasFormularioServidor {
  recetas: RecetaServidor[];
  productos: { id: number; name: string; sku: string | null; unit_code: string; track_stock: boolean }[];
  ordenes_abiertas: number;
}

export interface NecesidadIngrediente {
  product_id: number;
  nombre: string;
  unidad: string;
  necesario: number;
  disponible: number;
  faltante: number;
  error: string | null;
}

export interface ItemExpandido {
  product_id: number;
  quantity: number;
  track_stock: boolean;
  es_ingrediente: boolean;
}

export interface IngredienteOpcion {
  id: number;
  nombre: string;
  sku: string | null;
  unidad: string;
  trackStock: boolean;
}

interface FilaIngredienteBd {
  id: number;
  name: string;
  sku: string | null;
  unit_code: string | null;
  track_stock: boolean | null;
}

/** Texto seguro para el filtro `or(...)` de PostgREST (sin comas, comodines ni paréntesis). */
export function limpiarBusqueda(texto: string): string {
  return texto.replace(/[,%()*\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

function aIngredienteOpcion(p: FilaIngredienteBd): IngredienteOpcion {
  return {
    id: Number(p.id),
    nombre: p.name,
    sku: p.sku,
    unidad: (p.unit_code ?? 'UN').trim() || 'UN',
    trackStock: p.track_stock !== false,
  };
}

interface IngredienteEntrada {
  ingredient_product_id: number;
  quantity: number;
  unit_code: string | null;
  is_optional?: boolean | null;
  notes?: string | null;
}

function aIngredientePayload(ing: IngredienteEntrada): IngredientePayload {
  return {
    ingredient_product_id: ing.ingredient_product_id,
    quantity: Number(ing.quantity),
    unit_code: (ing.unit_code ?? '').trim() || null,
    waste_pct: 0,
    is_optional: ing.is_optional ?? false,
    notes: ing.notes?.trim() ? ing.notes : null,
  };
}

const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

/** PostgREST devuelve numeric como número o texto: todo a número. */
export function normalizarCosto(data: unknown): CostoReceta {
  const d = (data ?? {}) as Record<string, unknown>;
  const lineas = Array.isArray(d.lineas) ? (d.lineas as Record<string, unknown>[]) : [];
  return {
    permitido: d.permitido !== false,
    rinde: Number(d.rinde) || 1,
    unidad_rinde: (d.unidad_rinde as string | null) ?? null,
    costo_tanda: numOrNull(d.costo_tanda),
    costo_unidad: numOrNull(d.costo_unidad),
    completo: d.completo === true,
    lineas_sin_costo: Number(d.lineas_sin_costo) || 0,
    lineas_con_error: Number(d.lineas_con_error) || 0,
    lineas: lineas.map((l) => ({
      orden: Number(l.orden),
      ingredient_product_id: numOrNull(l.ingredient_product_id),
      nombre: (l.nombre as string | null) ?? null,
      sku: (l.sku as string | null) ?? null,
      track_stock: l.track_stock === true,
      unidad_receta: String(l.unidad_receta ?? ''),
      unidad_ingrediente: String(l.unidad_ingrediente ?? ''),
      cantidad_neta: Number(l.cantidad_neta) || 0,
      merma_pct: Number(l.merma_pct) || 0,
      cantidad_bruta: Number(l.cantidad_bruta) || 0,
      factor: numOrNull(l.factor),
      cantidad: Number(l.cantidad) || 0,
      opcional: l.opcional === true,
      existencia: numOrNull(l.existencia),
      fuente: (l.fuente as FuenteCosto) ?? 'sin_costo',
      costo_unitario: numOrNull(l.costo_unitario),
      costo_linea: numOrNull(l.costo_linea),
      error: (l.error as LineaCostoReceta['error']) ?? null,
    })),
  };
}

// ── Listado de recetas y costo de recetas (fn_recetas_listado, B5) ─────────

export type ModoRecetaListado = 'al_producir' | 'al_vender';
export type FuenteCostoReceta = 'promedio_sucursal' | 'costo_vigente' | 'sin_costo' | 'sin_conversion';

export interface FiltrosRecetas {
  sucursal?: number | null;
  busqueda?: string;
  estado?: 'activas' | 'inactivas' | 'todas';
  modo?: ModoRecetaListado;
  costo?: 'incompleto';
  margen_bajo?: boolean;
  producto?: number;
  orden?: 'producto' | 'costo' | 'margen' | 'fecha';
  direccion?: 'asc' | 'desc';
  desde_fila?: number;
  limite?: number;
}

export interface FilaReceta {
  recipe_id: number;
  product_id: number;
  nombre: string | null;
  version: number;
  activa: boolean;
  rinde: number;
  unidad_rinde: string;
  creada_en: string | null;
  producto: { id: number; nombre: string; sku: string | null; unidad: string; variante: boolean; decimales: number; track_stock: boolean };
  modo: ModoRecetaListado;
  ingredientes: number;
  costo_tanda: number | null;
  costo_unidad: number | null;
  completo: boolean;
  lineas_sin_costo: number;
  lineas_con_error: number;
  fuente: FuenteCostoReceta;
  precio: number | null;
  /** (precio − costo) ÷ precio; null sin precio o sin permiso de costos. */
  margen: number | null;
  ordenes_abiertas: number;
}

export interface KpisRecetas {
  activas: number;
  inactivas: number;
  completas: number;
  costo_incompleto: number;
  margen_bajo: number;
  umbral_margen: number;
  ingredientes_sin_costo: number;
  margen_ponderado: number | null;
  ordenes_mes: number;
}

export interface ListadoRecetas {
  filas: FilaReceta[];
  total: number;
  kpis: KpisRecetas;
  /** Permisos de inventario (fn_inventario_permisos). */
  permisos: Record<string, boolean>;
}

export interface VersionReceta {
  recipe_id: number;
  version: number;
  nombre: string | null;
  activa: boolean;
  creada_en: string | null;
  autor: string | null;
  rinde: number;
  ingredientes: number;
  costo_unidad: number | null;
  ordenes: number;
  ordenes_abiertas: number;
}

export function normalizarListadoRecetas(data: unknown): ListadoRecetas {
  const d = (data ?? {}) as Record<string, unknown>;
  const k = (d.kpi ?? {}) as Record<string, unknown>;
  const filas = Array.isArray(d.filas) ? (d.filas as Record<string, unknown>[]) : [];
  return {
    total: Number(d.total) || 0,
    permisos: (d.permisos ?? {}) as Record<string, boolean>,
    kpis: {
      activas: Number(k.activas) || 0,
      inactivas: Number(k.inactivas) || 0,
      completas: Number(k.completas) || 0,
      costo_incompleto: Number(k.costo_incompleto) || 0,
      margen_bajo: Number(k.margen_bajo) || 0,
      umbral_margen: Number(k.umbral_margen) || 0.3,
      ingredientes_sin_costo: Number(k.ingredientes_sin_costo) || 0,
      margen_ponderado: numOrNull(k.margen_ponderado),
      ordenes_mes: Number(k.ordenes_mes) || 0,
    },
    filas: filas.map((f) => {
      const p = (f.producto ?? {}) as Record<string, unknown>;
      return {
        recipe_id: Number(f.recipe_id),
        product_id: Number(f.product_id),
        nombre: (f.nombre as string | null) ?? null,
        version: Number(f.version) || 1,
        activa: f.activa === true,
        rinde: Number(f.rinde) || 1,
        unidad_rinde: String(f.unidad_rinde ?? 'UN').trim() || 'UN',
        creada_en: (f.creada_en as string | null) ?? null,
        producto: {
          id: Number(p.id),
          nombre: String(p.nombre ?? ''),
          sku: (p.sku as string | null) ?? null,
          unidad: String(p.unidad ?? 'UN').trim() || 'UN',
          variante: p.variante === true,
          decimales: Number(p.decimales) || 0,
          track_stock: p.track_stock !== false,
        },
        modo: f.modo === 'al_producir' ? 'al_producir' : 'al_vender',
        ingredientes: Number(f.ingredientes) || 0,
        costo_tanda: numOrNull(f.costo_tanda),
        costo_unidad: numOrNull(f.costo_unidad),
        completo: f.completo === true,
        lineas_sin_costo: Number(f.lineas_sin_costo) || 0,
        lineas_con_error: Number(f.lineas_con_error) || 0,
        fuente: (f.fuente as FuenteCostoReceta) ?? 'sin_costo',
        precio: numOrNull(f.precio),
        margen: numOrNull(f.margen),
        ordenes_abiertas: Number(f.ordenes_abiertas) || 0,
      };
    }),
  };
}

class RecipeService {
  async getRecipes(organizationId: number): Promise<ProductRecipe[]> {
    try {
      const { data, error } = await supabase
        .from('product_recipes')
        .select(`
          *,
          product:products (
            id, name, sku, is_composite, production_type
          )
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as ProductRecipe[];
    } catch (error) {
      console.error('Error obteniendo recetas:', error);
      throw error;
    }
  }

  async getRecipeById(recipeId: number): Promise<ProductRecipe | null> {
    try {
      const { data, error } = await supabase
        .from('product_recipes')
        .select(`
          *,
          product:products (
            id, name, sku, is_composite, production_type
          )
        `)
        .eq('id', recipeId)
        .single();

      if (error) throw error;

      if (!data) return null;

      const { data: ingredients, error: ingError } = await supabase
        .from('recipe_ingredients')
        .select(`
          *,
          ingredient_product:products (
            id, name, sku, track_stock, unit_code
          )
        `)
        .eq('recipe_id', recipeId)
        .order('sort_order', { ascending: true });

      if (ingError) throw ingError;

      return { ...data, ingredients: ingredients || [] } as ProductRecipe;
    } catch (error) {
      console.error('Error obteniendo receta:', error);
      throw error;
    }
  }

  async getRecipeByProductId(productId: number): Promise<ProductRecipe | null> {
    try {
      const { data: recipe, error: recipeError } = await supabase
        .from('product_recipes')
        .select(`
          *,
          product:products (
            id, name, sku, is_composite, production_type
          )
        `)
        .eq('product_id', productId)
        .eq('is_active', true)
        .maybeSingle();

      if (recipeError) throw recipeError;
      if (!recipe) return null;

      const { data: ingredients, error: ingError } = await supabase
        .from('recipe_ingredients')
        .select(`
          *,
          ingredient_product:products (
            id, name, sku, track_stock, unit_code
          )
        `)
        .eq('recipe_id', recipe.id)
        .order('sort_order', { ascending: true });

      if (ingError) throw ingError;

      return { ...recipe, ingredients: ingredients || [] } as ProductRecipe;
    } catch (error) {
      console.error('Error obteniendo receta por producto:', error);
      throw error;
    }
  }

  /**
   * Crea la receta del producto (o su versión nueva si ya tenía una activa)
   * en una sola RPC transaccional: `fn_receta_guardar`, la misma interna que
   * usa el formulario de producto. Antes eran 4 llamadas desde el navegador sin
   * transacción y con `version: 1` fijo.
   */
  async createRecipe(data: CreateRecipeData): Promise<ProductRecipe> {
    const r = await this.guardarReceta(data.organization_id, data.product_id, {
      name: data.name ?? null,
      yield_qty: data.yield_qty ?? 1,
      yield_unit_code: data.yield_unit_code?.trim() || null,
      notes: data.notes ?? null,
      ingredientes: data.ingredients.map(aIngredientePayload),
    });
    return (await this.getRecipeById(r.recipe_id)) as ProductRecipe;
  }

  /**
   * Editar una receta crea su versión N+1 (las órdenes de producción abiertas
   * siguen con la suya). Si no cambió nada, no se crea versión. Desactivar sin
   * más cambios sigue siendo `deactivateRecipe`.
   */
  async updateRecipe(recipeId: number, data: UpdateRecipeData): Promise<ProductRecipe> {
    const actual = await this.getRecipeById(recipeId);
    if (!actual) throw new Error('receta_no_encontrada');
    const soloDesactivar =
      data.is_active === false &&
      data.ingredients === undefined &&
      data.name === undefined &&
      data.yield_qty === undefined &&
      data.yield_unit_code === undefined &&
      data.notes === undefined;
    if (soloDesactivar) {
      await this.deactivateRecipe(recipeId);
      return { ...actual, is_active: false };
    }
    const ingredientes: IngredienteEntrada[] = data.ingredients ?? actual.ingredients ?? [];
    const r = await this.guardarReceta(actual.organization_id, actual.product_id, {
      name: data.name !== undefined ? data.name : actual.name,
      yield_qty: data.yield_qty ?? actual.yield_qty ?? 1,
      yield_unit_code: (data.yield_unit_code ?? actual.yield_unit_code ?? '').trim() || null,
      notes: data.notes !== undefined ? data.notes : actual.notes,
      ingredientes: ingredientes.map(aIngredientePayload),
    });
    return (await this.getRecipeById(r.recipe_id)) as ProductRecipe;
  }

  // ── Receta: RPC del servidor (docs/design/PRODUCTO-RECETAS-Y-SUBSECCIONES.md §2.4) ──

  /** Guarda una versión (o nada si no cambió) con el permiso resuelto en el servidor. */
  async guardarReceta(
    organizationId: number,
    productId: number,
    receta: RecetaPayload & { modo?: ModoRecetaPayload },
  ): Promise<ResultadoGuardarReceta> {
    const { data, error } = await supabase.rpc('fn_receta_guardar', {
      p_organization_id: organizationId,
      p_product_id: productId,
      p_receta: receta,
    });
    if (error) throw error;
    return data as ResultadoGuardarReceta;
  }

  /**
   * Costo de un borrador (o de `{ recipe_id }`) en una sucursal: el mismo cálculo
   * que descuenta la venta (`fn_receta_int_calcular`), no una copia en TypeScript.
   * Sin `inventory.costs.view` llegan las líneas sin importes (`permitido: false`).
   */
  async costo(
    organizationId: number,
    branchId: number | null,
    receta: RecetaPayload | { recipe_id: number },
  ): Promise<CostoReceta> {
    const { data, error } = await supabase.rpc('fn_receta_costo', {
      p_organization_id: organizationId,
      p_branch_id: branchId,
      p_receta: receta,
    });
    if (error) throw error;
    return normalizarCosto(data);
  }

  /** Recetas activas del producto y sus variantes, con lo necesario para el editor. */
  async paraFormulario(organizationId: number, productId: number): Promise<RecetasFormularioServidor> {
    const { data, error } = await supabase.rpc('fn_producto_recetas_para_formulario', {
      p_organization_id: organizationId,
      p_product_id: productId,
    });
    if (error) throw error;
    const d = (data ?? {}) as Partial<RecetasFormularioServidor>;
    return {
      recetas: d.recetas ?? [],
      productos: d.productos ?? [],
      ordenes_abiertas: Number(d.ordenes_abiertas) || 0,
    };
  }

  /** Faltantes de ingredientes para vender unos ítems (una llamada por carrito). */
  async necesidades(
    organizationId: number,
    branchId: number,
    items: readonly { product_id: number; quantity: number }[],
  ): Promise<NecesidadIngrediente[]> {
    const { data, error } = await supabase.rpc('fn_receta_necesidades', {
      p_organization_id: organizationId,
      p_branch_id: branchId,
      p_items: items,
    });
    if (error) throw error;
    return ((data ?? []) as NecesidadIngrediente[]).map((n) => ({
      ...n,
      necesario: Number(n.necesario) || 0,
      disponible: Number(n.disponible) || 0,
      faltante: Number(n.faltante) || 0,
    }));
  }

  /** Qué se mueve del inventario al vender `qty` de un producto (reservas web). */
  async expandir(productId: number, qty: number): Promise<ItemExpandido[]> {
    const { data, error } = await supabase.rpc('fn_receta_expandir', { p_product_id: productId, p_qty: qty });
    if (error) throw error;
    return ((data ?? []) as ItemExpandido[]).map((i) => ({ ...i, quantity: Number(i.quantity) || 0 }));
  }

  /**
   * Buscador de ingredientes: productos de la organización que se pueden usar
   * como insumo (sin servicios, sin padres con variantes, sin borrados) y sin
   * los ids excluidos (el propio producto y sus variantes).
   */
  async buscarIngredientes(
    organizationId: number,
    texto: string,
    excluir: readonly number[] = [],
    senal?: AbortSignal,
  ): Promise<IngredienteOpcion[]> {
    const limpio = limpiarBusqueda(texto);
    let q = supabase
      .from('products')
      .select('id, name, sku, unit_code, track_stock')
      .eq('organization_id', organizationId)
      .neq('status', 'deleted')
      .neq('product_type', 'service')
      .eq('is_parent', false)
      .order('name')
      .limit(20);
    if (limpio) q = q.or(`name.ilike.%${limpio}%,sku.ilike.%${limpio}%`);
    if (excluir.length > 0) q = q.not('id', 'in', `(${excluir.join(',')})`);
    if (senal) q = q.abortSignal(senal);
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as FilaIngredienteBd[]).map(aIngredienteOpcion);
  }

  /** Un ingrediente por id (tras «Crear ingrediente»). */
  async ingredientePorId(organizationId: number, productId: number): Promise<IngredienteOpcion | null> {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku, unit_code, track_stock')
      .eq('organization_id', organizationId)
      .eq('id', productId)
      .maybeSingle();
    if (error) throw error;
    return data ? aIngredienteOpcion(data as FilaIngredienteBd) : null;
  }

  /**
   * Desactiva la versión activa (deja de descontar ingredientes al vender; las
   * órdenes abiertas siguen con su versión). RPC con el mismo permiso que
   * guardar; la base rechaza el UPDATE directo (`receta_solo_por_rpc`).
   */
  async desactivar(organizationId: number, recipeId: number): Promise<{ recipe_id: number; ordenes_abiertas: number }> {
    const { data, error } = await supabase.rpc('fn_receta_desactivar', { p_org: organizationId, p_recipe_id: recipeId });
    if (error) throw error;
    const d = (data ?? {}) as { recipe_id?: number; ordenes_abiertas?: number };
    return { recipe_id: Number(d.recipe_id), ordenes_abiertas: Number(d.ordenes_abiertas) || 0 };
  }

  /** Copia una versión anterior como versión nueva (las versiones no se editan ni se borran). */
  async reactivar(organizationId: number, recipeId: number): Promise<ResultadoGuardarReceta> {
    const { data, error } = await supabase.rpc('fn_receta_reactivar', { p_org: organizationId, p_recipe_id: recipeId });
    if (error) throw error;
    return data as ResultadoGuardarReceta;
  }

  /** @deprecated Usa `desactivar(org, id)`: la organización sale de la sesión y el permiso del servidor. */
  async deactivateRecipe(recipeId: number, organizationId?: number): Promise<void> {
    const org = organizationId ?? (await this.getRecipeById(recipeId))?.organization_id;
    if (!org) throw new Error('receta_no_encontrada');
    await this.desactivar(org, recipeId);
  }

  /** Recetas de la organización (una por producto) con costo y margen en la sucursal. */
  async listar(organizationId: number, filtros: FiltrosRecetas = {}, senal?: AbortSignal): Promise<ListadoRecetas> {
    let q = supabase.rpc('fn_recetas_listado', { p_org: organizationId, p_filtros: filtros });
    if (senal) q = q.abortSignal(senal);
    const { data, error } = await q;
    if (error) throw error;
    return normalizarListadoRecetas(data);
  }

  /** Versiones de la receta de un producto (la más nueva primero). */
  async versiones(organizationId: number, productId: number, branchId: number | null): Promise<VersionReceta[]> {
    const { data, error } = await supabase.rpc('fn_receta_versiones', {
      p_org: organizationId,
      p_product: productId,
      p_branch: branchId,
    });
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((v) => ({
      recipe_id: Number(v.recipe_id),
      version: Number(v.version) || 1,
      nombre: (v.nombre as string | null) ?? null,
      activa: v.activa === true,
      creada_en: (v.creada_en as string | null) ?? null,
      autor: (v.autor as string | null) ?? null,
      rinde: Number(v.rinde) || 1,
      ingredientes: Number(v.ingredientes) || 0,
      costo_unidad: numOrNull(v.costo_unidad),
      ordenes: Number(v.ordenes) || 0,
      ordenes_abiertas: Number(v.ordenes_abiertas) || 0,
    }));
  }
}

export const recipeService = new RecipeService();
