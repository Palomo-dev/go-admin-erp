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

/**
 * Menú «⋯» de una categoría, el mismo en la fila del árbol, la tarjeta móvil
 * (hoja de acciones) y la cabecera del detalle. Orden del manual: editar →
 * dominio → estado → divisor → eliminar (rojo, con ConfirmDialog). Tope 8.
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
): AccionFila[] {
  const activa = cat.is_active !== false;
  return [
    ...(m.editar ? [{ id: 'editar', etiqueta: 'Editar', icono: Pencil, onSelect: m.editar }] : []),
    { id: 'subcategoria', etiqueta: 'Agregar subcategoría', icono: FolderPlus, onSelect: m.agregarSubcategoria },
    { id: 'mover', etiqueta: 'Mover a…', icono: FolderInput, onSelect: m.mover },
    {
      id: 'raiz',
      etiqueta: 'Mover a la raíz',
      icono: ArrowUpToLine,
      onSelect: m.moverARaiz,
      oculta: cat.parent_id === null,
    },
    { id: 'duplicar', etiqueta: 'Duplicar', icono: Copy, onSelect: m.duplicar },
    { id: 'productos', etiqueta: 'Ver productos', icono: Package, onSelect: m.verProductos },
    ...(m.copiarId ? [{ id: 'copiar-id', etiqueta: 'Copiar ID', icono: Hash, onSelect: m.copiarId }] : []),
    {
      id: 'estado',
      etiqueta: activa ? 'Desactivar' : 'Activar',
      icono: activa ? PowerOff : Power,
      onSelect: m.alternarActiva,
      separadorAntes: true,
    },
    { id: 'eliminar', etiqueta: 'Eliminar', icono: Trash2, onSelect: m.eliminar, destructiva: true },
  ];
}
