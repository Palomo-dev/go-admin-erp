/**
 * Receta: estado del borrador, validación en línea y payload, sin React.
 * Lo usan el formulario de producto («Avanzado › Receta») y, más adelante, el
 * detalle (pestaña Producción) y la pantalla Recetas: un solo editor
 * (`EditorReceta`) y una sola lógica. El cálculo de cantidades y costos NO está
 * aquí: lo hace el servidor (`fn_receta_costo` → `fn_receta_int_calcular`), el
 * mismo que descuenta la venta. Diseño: docs/design/PRODUCTO-RECETAS-Y-SUBSECCIONES.md §2.
 */
import type {
  DestinoRecetaPayload,
  IngredientePayload,
  LineaCostoReceta,
  ModoRecetaPayload,
  PayloadRecetaProducto,
  RecetaPayload,
  RecetaServidor,
  RecetasFormularioServidor,
} from '@/lib/services/recipeService';

// ── Tipos ──────────────────────────────────────────────────────────────────

export type ModoReceta = ModoRecetaPayload;
export type AlcanceReceta = 'compartida' | 'por_variante';

export interface IngredienteBorrador {
  /** Clave local estable (no es un id de BD). */
  clave: string;
  ingredientProductId: number;
  nombre: string;
  sku: string | null;
  /** Unidad en la que se lleva el ingrediente (su products.unit_code). */
  unidadIngrediente: string;
  trackStock: boolean;
  cantidad: number | null;
  /** Unidad en la que se escribe la receta (UN, GR, ML…). */
  unidad: string;
  mermaPct: number | null;
  opcional: boolean;
  notas: string | null;
}

export interface RecetaBorrador {
  /** Editar: la versión activa que se reemplaza. */
  id?: number;
  version?: number;
  /** Instante de la versión activa (ISO, se muestra en la zona de la organización). */
  desde?: string | null;
  nombre: string;
  rinde: number | null;
  unidadRinde: string;
  notas: string | null;
  ingredientes: IngredienteBorrador[];
}

/**
 * Receta en el formulario de producto. `porVariante` se indexa por
 * `VarianteForm.clave` (estable aunque la variante aún no tenga id); una
 * variante que no aparece usa la receta compartida.
 */
export interface RecetaForm {
  activa: boolean;
  modo: ModoReceta;
  alcance: AlcanceReceta;
  compartida: RecetaBorrador | null;
  porVariante: Record<string, RecetaBorrador>;
}

export interface UnidadReceta {
  code: string;
  name: string;
  unit_type?: string | null;
}

/** Errores de una fila (claves i18n en `receta.errores.*`). */
export type ErrorLineaReceta = 'cantidad_invalida' | 'merma_invalida' | 'repetido' | 'autorreferida';

/** Errores de la receta completa (claves i18n en `receta.errores.*`). */
export type ErrorGeneralReceta = 'sin_ingredientes' | 'rinde_invalido';

export interface ValidacionReceta {
  general: ErrorGeneralReceta | null;
  lineas: Record<string, ErrorLineaReceta>;
}

export type EstadoVarianteReceta = 'sin_receta' | 'compartida' | 'propia' | 'con_errores';

// ── Construcción ───────────────────────────────────────────────────────────

let contador = 0;
export function nuevaClaveIngrediente(): string {
  contador += 1;
  return `ing${Date.now().toString(36)}${contador}`;
}

export const unidadLimpia = (u: string | null | undefined, porDefecto = 'UN'): string =>
  (u ?? '').trim().toUpperCase() || porDefecto;

export function recetaVacia(unidadProducto = 'UN'): RecetaBorrador {
  return { nombre: '', rinde: 1, unidadRinde: unidadLimpia(unidadProducto), notas: null, ingredientes: [] };
}

export function recetaFormInicial(): RecetaForm {
  return { activa: false, modo: 'al_vender', alcance: 'compartida', compartida: null, porVariante: {} };
}

export function ingredienteDesdeOpcion(
  opcion: { id: number; nombre: string; sku: string | null; unidad: string; trackStock: boolean },
): IngredienteBorrador {
  const unidad = unidadLimpia(opcion.unidad);
  return {
    clave: nuevaClaveIngrediente(),
    ingredientProductId: opcion.id,
    nombre: opcion.nombre,
    sku: opcion.sku,
    unidadIngrediente: unidad,
    trackStock: opcion.trackStock,
    cantidad: 1,
    unidad,
    mermaPct: 0,
    opcional: false,
    notas: null,
  };
}

/** Copia editable con claves nuevas y sin id (decisión 2: «Copiar de la compartida y ajustar»). */
export function copiarReceta(b: RecetaBorrador): RecetaBorrador {
  return {
    nombre: b.nombre,
    rinde: b.rinde,
    unidadRinde: b.unidadRinde,
    notas: b.notas,
    ingredientes: b.ingredientes.map((i) => ({ ...i, clave: nuevaClaveIngrediente() })),
  };
}

/** Receta guardada → borrador (editar y duplicar). */
export function recetaDesdeServidor(
  r: RecetaServidor,
  productos: RecetasFormularioServidor['productos'],
  opciones: { conId: boolean },
): RecetaBorrador {
  const porId = new Map(productos.map((p) => [Number(p.id), p]));
  return {
    ...(opciones.conId ? { id: r.recipe_id, version: r.version, desde: r.created_at } : {}),
    nombre: r.name ?? '',
    rinde: Number(r.yield_qty) || 1,
    unidadRinde: unidadLimpia(r.yield_unit_code, ''),
    notas: r.notes,
    ingredientes: r.ingredientes.map((i) => {
      const p = porId.get(Number(i.ingredient_product_id));
      return {
        clave: nuevaClaveIngrediente(),
        ingredientProductId: Number(i.ingredient_product_id),
        nombre: p?.name ?? `#${i.ingredient_product_id}`,
        sku: p?.sku ?? null,
        unidadIngrediente: unidadLimpia(p?.unit_code),
        trackStock: p?.track_stock !== false,
        cantidad: Number(i.quantity),
        unidad: unidadLimpia(i.unit_code),
        mermaPct: Number(i.waste_pct) || 0,
        opcional: Boolean(i.is_optional),
        notas: i.notes,
      };
    }),
  };
}

/**
 * Estado de la receta del formulario a partir de lo guardado.
 * Activa si el producto es compuesto o si tiene alguna receta activa (propia o
 * en sus variantes: hay productos con variantes con receta y el padre sin marcar).
 */
export function recetaFormDesdeServidor(
  datos: RecetasFormularioServidor,
  contexto: {
    productId: number;
    esCompuesto: boolean;
    alProducir: boolean;
    /** id de variante → clave del formulario. */
    claveDeVariante: ReadonlyMap<number, string>;
    conId: boolean;
  },
): RecetaForm {
  const r = recetaFormInicial();
  for (const rec of datos.recetas) {
    const b = recetaDesdeServidor(rec, datos.productos, { conId: contexto.conId });
    if (Number(rec.product_id) === contexto.productId) {
      r.compartida = b;
    } else {
      const clave = contexto.claveDeVariante.get(Number(rec.product_id));
      if (clave) r.porVariante[clave] = b;
    }
  }
  r.activa = contexto.esCompuesto || r.compartida !== null || Object.keys(r.porVariante).length > 0;
  r.modo = contexto.alProducir ? 'al_producir' : 'al_vender';
  r.alcance = Object.keys(r.porVariante).length > 0 ? 'por_variante' : 'compartida';
  return r;
}

// ── Cálculo local mínimo (vista previa; el valor bueno lo da el servidor) ──

/** Bruta = neta ÷ (1 − merma) (decisión 3: merma sobre la cantidad neta). */
export function cantidadBruta(neta: number, mermaPct: number | null | undefined): number {
  const m = Math.min(Math.max(mermaPct ?? 0, 0), 99.99);
  return neta / (1 - m / 100);
}

/** Margen sobre el precio de venta: (precio − costo) ÷ precio. null si no aplica. */
export function margenReceta(costoUnidad: number | null | undefined, precio: number | null | undefined): number | null {
  if (costoUnidad === null || costoUnidad === undefined || !precio || precio <= 0) return null;
  return (precio - costoUnidad) / precio;
}

/** Unidades del mismo tipo que la del ingrediente (UN ↔ PAQ, GR ↔ KG…). Sin tipo conocido: todas. */
export function unidadesCompatibles(unidades: readonly UnidadReceta[], unidadIngrediente: string): UnidadReceta[] {
  const tipo = unidades.find((u) => unidadLimpia(u.code) === unidadLimpia(unidadIngrediente))?.unit_type;
  if (!tipo) return [...unidades];
  return unidades.filter((u) => !u.unit_type || u.unit_type === tipo);
}

// ── Validación en línea ────────────────────────────────────────────────────

const claveRepetido = (i: IngredienteBorrador) => `${i.ingredientProductId}|${unidadLimpia(i.unidad)}`;

/** Filas que repiten ingrediente y unidad de una anterior (se ofrecen para fusionar). */
export function duplicados(b: RecetaBorrador): Set<string> {
  const vistos = new Set<string>();
  const rep = new Set<string>();
  for (const i of b.ingredientes) {
    const k = claveRepetido(i);
    if (vistos.has(k)) rep.add(i.clave);
    else vistos.add(k);
  }
  return rep;
}

/** Fusiona la fila repetida en la primera con el mismo ingrediente y unidad (suma cantidades). */
export function fusionarDuplicado(b: RecetaBorrador, clave: string): RecetaBorrador {
  const fila = b.ingredientes.find((i) => i.clave === clave);
  if (!fila) return b;
  const destino = b.ingredientes.find((i) => i.clave !== clave && claveRepetido(i) === claveRepetido(fila));
  if (!destino) return b;
  return {
    ...b,
    ingredientes: b.ingredientes
      .filter((i) => i.clave !== clave)
      .map((i) => (i.clave === destino.clave ? { ...i, cantidad: (i.cantidad ?? 0) + (fila.cantidad ?? 0) } : i)),
  };
}

export function validarReceta(b: RecetaBorrador, contexto: { excluirIds?: readonly number[] } = {}): ValidacionReceta {
  const lineas: Record<string, ErrorLineaReceta> = {};
  const excluir = new Set(contexto.excluirIds ?? []);
  const rep = duplicados(b);
  for (const i of b.ingredientes) {
    if (excluir.has(i.ingredientProductId)) lineas[i.clave] = 'autorreferida';
    else if (!(i.cantidad !== null && i.cantidad > 0)) lineas[i.clave] = 'cantidad_invalida';
    else if (i.mermaPct !== null && (i.mermaPct < 0 || i.mermaPct >= 100)) lineas[i.clave] = 'merma_invalida';
    else if (rep.has(i.clave)) lineas[i.clave] = 'repetido';
  }
  let general: ErrorGeneralReceta | null = null;
  if (!(b.rinde !== null && b.rinde > 0)) general = 'rinde_invalido';
  else if (b.ingredientes.length === 0) general = 'sin_ingredientes';
  return { general, lineas };
}

export const recetaValida = (v: ValidacionReceta) => v.general === null && Object.keys(v.lineas).length === 0;

/**
 * Error del campo «receta» del formulario (clave de `productoForm.errores`), o null.
 * Las conversiones que faltan las marca el servidor (vista previa de costo y guardado).
 */
export type CodigoErrorRecetaForm =
  | 'receta_sin_ingredientes'
  | 'receta_con_errores'
  | 'receta_al_producir_sin_inventario';

export function validarRecetaForm(
  r: RecetaForm,
  contexto: { tieneVariantes: boolean; clavesVariantes: readonly string[]; rastreaInventario: boolean; excluirIds: readonly number[] },
): CodigoErrorRecetaForm | null {
  if (!r.activa) return null;
  if (r.modo === 'al_producir' && !contexto.rastreaInventario) return 'receta_al_producir_sin_inventario';
  const destinos = destinosReceta(r, contexto.tieneVariantes, contexto.clavesVariantes);
  if (destinos.length === 0) return 'receta_sin_ingredientes';
  for (const d of destinos) {
    const v = validarReceta(d.receta, { excluirIds: contexto.excluirIds });
    if (v.general === 'sin_ingredientes') return 'receta_sin_ingredientes';
    if (!recetaValida(v)) return 'receta_con_errores';
  }
  return null;
}

/** Estado de la receta de una variante (chips del alcance). */
export function estadoVariante(
  r: RecetaForm,
  clave: string,
  excluirIds: readonly number[] = [],
): EstadoVarianteReceta {
  const propia = r.alcance === 'por_variante' ? r.porVariante[clave] : undefined;
  if (propia) return recetaValida(validarReceta(propia, { excluirIds })) ? 'propia' : 'con_errores';
  return r.compartida && r.compartida.ingredientes.length > 0 ? 'compartida' : 'sin_receta';
}

/**
 * Quita las recetas de variantes cuya clave ya no existe (se regeneró la matriz).
 * Devuelve cuántas se quitaron para avisar: «2 recetas de variantes que ya no existen se quitaron».
 */
export function limpiarRecetasHuerfanas(r: RecetaForm, claves: readonly string[]): { receta: RecetaForm; quitadas: number } {
  const vivas = new Set(claves);
  const porVariante: Record<string, RecetaBorrador> = {};
  let quitadas = 0;
  for (const [k, v] of Object.entries(r.porVariante)) {
    if (vivas.has(k)) porVariante[k] = v;
    else quitadas += 1;
  }
  return quitadas === 0 ? { receta: r, quitadas } : { receta: { ...r, porVariante }, quitadas };
}

// ── Payload ────────────────────────────────────────────────────────────────

export function recetaAPayload(b: RecetaBorrador): RecetaPayload {
  return {
    name: b.nombre.trim() || null,
    yield_qty: b.rinde ?? 1,
    yield_unit_code: b.unidadRinde.trim() ? unidadLimpia(b.unidadRinde) : null,
    notes: b.notas?.trim() ? b.notas : null,
    ingredientes: b.ingredientes.map<IngredientePayload>((i) => ({
      ingredient_product_id: i.ingredientProductId,
      quantity: i.cantidad ?? 0,
      unit_code: unidadLimpia(i.unidad, unidadLimpia(i.unidadIngrediente)),
      waste_pct: i.mermaPct ?? 0,
      is_optional: i.opcional,
      notes: i.notas?.trim() ? i.notas : null,
    })),
  };
}

export type DestinoReceta = DestinoRecetaPayload;
export type { PayloadRecetaProducto };

/** Recetas que se envían: la compartida (si tiene ingredientes) y las propias de variantes vivas. */
export function destinosReceta(
  r: RecetaForm,
  tieneVariantes: boolean,
  clavesVariantes: readonly string[],
): { destino: DestinoReceta; receta: RecetaBorrador }[] {
  const out: { destino: DestinoReceta; receta: RecetaBorrador }[] = [];
  if (r.compartida && r.compartida.ingredientes.length > 0) out.push({ destino: 'producto', receta: r.compartida });
  if (tieneVariantes && r.alcance === 'por_variante') {
    for (const clave of clavesVariantes) {
      const propia = r.porVariante[clave];
      if (propia) out.push({ destino: { variante: clave }, receta: propia });
    }
  }
  return out;
}

/** Clave «receta» del payload de `fn_producto_guardar`. */
export function payloadRecetaProducto(
  r: RecetaForm,
  tieneVariantes: boolean,
  clavesVariantes: readonly string[],
): PayloadRecetaProducto {
  if (!r.activa) return { activa: false, modo: r.modo, recetas: [] };
  return {
    activa: true,
    modo: r.modo,
    recetas: destinosReceta(r, tieneVariantes, clavesVariantes).map(({ destino, receta }) => ({
      destino,
      ...recetaAPayload(receta),
    })),
  };
}

// ── Servidor → filas ───────────────────────────────────────────────────────

/** Línea de costo de cada fila del borrador (el servidor responde en el mismo orden, 1-based). */
export function lineaDeFila(lineas: readonly LineaCostoReceta[] | undefined, indice: number): LineaCostoReceta | undefined {
  return lineas?.find((l) => l.orden === indice + 1);
}

/** Detalle de `conversion_faltante` que manda el servidor ({ingrediente_id, de, a}). */
export function detalleConversion(detalle: string | null | undefined): { ingredienteId: number; de: string; a: string } | null {
  if (!detalle) return null;
  try {
    const d = JSON.parse(detalle) as { ingrediente_id?: number; de?: string; a?: string };
    if (!d.ingrediente_id || !d.de || !d.a) return null;
    return { ingredienteId: Number(d.ingrediente_id), de: d.de, a: d.a };
  } catch {
    return null;
  }
}
