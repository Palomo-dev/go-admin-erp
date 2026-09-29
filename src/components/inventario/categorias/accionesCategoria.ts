import {
  ArrowUpToLine,
  Copy,
  FolderInput,
  FolderPlus,
  Hash,
  Package,
  Pencil,
  Power,
  PowerOff,
  Trash2,
} from 'lucide-react';
import type { AccionFila } from '@/components/kit';
import { ErrorCategoria } from '@/lib/services/categoryService';
import type { TraductorCategorias } from './iconoCategoria';

/**
 * Menú «⋯» de una categoría, el mismo en la fila del árbol, la tarjeta móvil
 * (hoja de acciones) y la cabecera del detalle. Orden del manual: editar →
 * dominio → estado → divisor → eliminar (rojo, con ConfirmDialog). Tope 8.
 * Las etiquetas salen de `categorias.acciones.*` con el `t` que pasa quien llama.
 */
export interface ManejadoresCategoria {
  editar?: () => void;
  agregarSubcategoria: () => void;
  mover: () => void;
  moverARaiz: () => void;
  duplicar: () => void;
  verProductos: () => void;
  alternarActiva: () => void;
  copiarId?: () => void;
  eliminar: () => void;
}

export function accionesDeCategoria(
  cat: { is_active: boolean | null; parent_id: number | null },
  m: ManejadoresCategoria,
  t: TraductorCategorias,
): AccionFila[] {
  const activa = cat.is_active !== false;
  return [
    ...(m.editar ? [{ id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: m.editar }] : []),
    { id: 'subcategoria', etiqueta: t('acciones.agregarSubcategoria'), icono: FolderPlus, onSelect: m.agregarSubcategoria },
    { id: 'mover', etiqueta: t('acciones.moverA'), icono: FolderInput, onSelect: m.mover },
    {
      id: 'raiz',
      etiqueta: t('acciones.moverARaiz'),
      icono: ArrowUpToLine,
      onSelect: m.moverARaiz,
      oculta: cat.parent_id === null,
    },
    { id: 'duplicar', etiqueta: t('acciones.duplicar'), icono: Copy, onSelect: m.duplicar },
    { id: 'productos', etiqueta: t('acciones.verProductos'), icono: Package, onSelect: m.verProductos },
    ...(m.copiarId ? [{ id: 'copiar-id', etiqueta: t('acciones.copiarId'), icono: Hash, onSelect: m.copiarId }] : []),
    {
      id: 'estado',
      etiqueta: activa ? t('acciones.desactivar') : t('acciones.activar'),
      icono: activa ? PowerOff : Power,
      onSelect: m.alternarActiva,
      separadorAntes: true,
    },
    { id: 'eliminar', etiqueta: t('acciones.eliminar'), icono: Trash2, onSelect: m.eliminar, destructiva: true },
  ];
}

/** Qué permiso de catálogo pide cada acción del menú (el servidor exige lo mismo). */
const PERMISO_ACCION: Readonly<Record<string, 'crear' | 'editar' | 'eliminar'>> = {
  editar: 'editar',
  subcategoria: 'crear',
  mover: 'editar',
  raiz: 'editar',
  duplicar: 'crear',
  estado: 'editar',
  eliminar: 'eliminar',
};

/** Oculta las acciones que el usuario no puede hacer (`usePermisosCatalogo`). */
export function segunPermisos(
  acciones: readonly AccionFila[],
  permisos: { crear: boolean; editar: boolean; eliminar: boolean },
): AccionFila[] {
  return acciones.map((a) => {
    const requiere = PERMISO_ACCION[a.id];
    return requiere && !permisos[requiere] ? { ...a, oculta: true } : a;
  });
}

/** `hint` de las RPC de categorías → clave de `categorias.errores.*`. */
const CLAVES_ERROR: Readonly<Record<string, string>> = {
  CATEGORIA_CICLO: 'ciclo',
  CATEGORIA_PADRE_INVALIDA: 'padreInvalida',
  CATEGORIA_NO_ENCONTRADA: 'noEncontrada',
  CATEGORIA_CON_PRODUCTOS: 'conProductos',
  CATEGORIA_DESTINO_INVALIDO: 'destinoInvalido',
};

/**
 * Mensaje de un error de categorías en el idioma activo. Los errores de la BD
 * llegan en español; si traen un código conocido (`hint`) se traduce el
 * código, y si no, se muestra el mensaje tal cual o el respaldo.
 */
export function mensajeErrorCategoria(e: unknown, t: TraductorCategorias, respaldo?: string): string | undefined {
  if (e instanceof ErrorCategoria) {
    if (e.slugDuplicado) return t('errores.slugDuplicado');
    const clave = e.codigo ? CLAVES_ERROR[e.codigo] : undefined;
    if (clave) return t(`errores.${clave}`);
  }
  return e instanceof Error && e.message ? e.message : respaldo;
}
