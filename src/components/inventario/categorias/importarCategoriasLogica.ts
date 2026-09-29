/**
 * Importar categorías: del archivo a las filas que revisa y aplica
 * `fn_categorias_importar` (sin React ni Supabase; se prueba en node).
 *
 * Cabeceras por alias (sin tildes ni mayúsculas), estación con el mismo
 * normalizador del importador de productos («Bebidas» → `bar`) y números y
 * booleanos con los de `lib/inventario/importacion/texto`.
 */
import { estacionDesdeTexto } from '@/lib/inventario/importacion/normalizacion';
import { normalizarCabecera, parseBooleano, parseNumero, textoCelda } from '@/lib/inventario/importacion/texto';

export interface FilaImportCategoria {
  /** Número de fila del archivo (la cabecera es la 1). */
  fila: number;
  name: string;
  parent_name?: string;
  slug?: string;
  color?: string;
  icon?: string;
  description?: string;
  is_active?: boolean;
  display_order?: number;
  station?: string;
  requires_preparation?: boolean;
  meta_title?: string;
  meta_description?: string;
}

type Campo = Exclude<keyof FilaImportCategoria, 'fila'>;

const ALIAS: Record<Campo, readonly string[]> = {
  name: ['nombre', 'name', 'categoria'],
  parent_name: ['categoriapadre', 'padre', 'parentname', 'parent'],
  slug: ['slug'],
  color: ['color'],
  icon: ['icono', 'icon'],
  description: ['descripcion', 'description'],
  is_active: ['activa', 'activo', 'isactive', 'active'],
  display_order: ['orden', 'displayorder', 'order'],
  station: ['estacion', 'station'],
  requires_preparation: ['requierepreparacion', 'requierespreparation', 'preparacion'],
  meta_title: ['metatitulo', 'metatitle'],
  meta_description: ['metadescripcion', 'metadescription'],
};

export const PLANTILLA_CATEGORIAS =
  'Nombre,Categoría padre,Slug,Color,Descripción,Activa,Estación,Requiere preparación\n' +
  'Bebidas,,bebidas,#3b82f6,Bebidas generales,Sí,Barra,No\n' +
  'Gaseosas,Bebidas,,#ef4444,Gaseosas y refrescos,Sí,Barra,No\n' +
  'Postres,,,#f59e0b,Postres de la casa,Sí,Cocina fría,Sí\n';

/** Índice de columna por campo, según la fila de cabecera. */
export function mapearCabeceras(cabecera: readonly unknown[]): Partial<Record<Campo, number>> {
  const mapa: Partial<Record<Campo, number>> = {};
  cabecera.forEach((c, i) => {
    const n = normalizarCabecera(c);
    for (const [campo, alias] of Object.entries(ALIAS) as [Campo, readonly string[]][]) {
      if (mapa[campo] === undefined && alias.includes(n)) mapa[campo] = i;
    }
  });
  return mapa;
}

/**
 * Filas del archivo (matriz de `leerMatriz`, con la cabecera en la primera
 * fila). Las filas totalmente vacías se saltan; las que no tienen nombre se
 * mandan igual para que el servidor las cuente como error con su número.
 */
export function filasDesdeMatriz(matriz: readonly (readonly unknown[])[]): FilaImportCategoria[] {
  if (matriz.length < 2) return [];
  const mapa = mapearCabeceras(matriz[0] ?? []);
  const celda = (fila: readonly unknown[], campo: Campo) => (mapa[campo] === undefined ? undefined : fila[mapa[campo] as number]);
  const filas: FilaImportCategoria[] = [];
  for (let i = 1; i < matriz.length; i++) {
    const f = matriz[i] ?? [];
    if (f.every((c) => textoCelda(c) === undefined)) continue;
    const estacion = estacionDesdeTexto(textoCelda(celda(f, 'station')));
    const orden = parseNumero(celda(f, 'display_order'));
    filas.push({
      fila: i + 1,
      name: textoCelda(celda(f, 'name')) ?? '',
      parent_name: textoCelda(celda(f, 'parent_name')),
      slug: textoCelda(celda(f, 'slug')),
      color: textoCelda(celda(f, 'color')),
      icon: textoCelda(celda(f, 'icon')),
      description: textoCelda(celda(f, 'description')),
      is_active: parseBooleano(celda(f, 'is_active')),
      display_order: orden === null ? undefined : Math.trunc(orden),
      station: estacion.estacion ?? undefined,
      requires_preparation: parseBooleano(celda(f, 'requires_preparation')),
      meta_title: textoCelda(celda(f, 'meta_title')),
      meta_description: textoCelda(celda(f, 'meta_description')),
    });
  }
  return filas;
}

export type MotivoCategoria = 'nombre_obligatorio' | 'ya_existe' | 'repetida' | 'padre_si_misma' | 'padre_no_existe';

export interface FilaRevisadaCategoria {
  fila: number;
  nombre: string;
  padre: string | null;
  accion: 'crear' | 'error';
  motivo: MotivoCategoria | null;
}

export interface RevisionCategorias {
  total: number;
  validas: number;
  con_error: number;
  subcategorias: number;
  creadas: number;
  filas: FilaRevisadaCategoria[];
}

export function aRevision(data: unknown): RevisionCategorias {
  const r = (data ?? {}) as Partial<RevisionCategorias>;
  return {
    total: Number(r.total) || 0,
    validas: Number(r.validas) || 0,
    con_error: Number(r.con_error) || 0,
    subcategorias: Number(r.subcategorias) || 0,
    creadas: Number(r.creadas) || 0,
    filas: (r.filas ?? []).map((f) => ({
      fila: Number(f.fila),
      nombre: String(f.nombre ?? ''),
      padre: f.padre ?? null,
      accion: f.accion === 'crear' ? 'crear' : 'error',
      motivo: (f.motivo as MotivoCategoria | null) ?? null,
    })),
  };
}
