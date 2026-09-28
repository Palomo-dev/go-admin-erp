import {
  Barcode,
  Boxes,
  CircleDollarSign,
  Image as ImageIcon,
  Package,
  Percent,
  Settings2,
  SlidersHorizontal,
  Split,
  Store,
  type LucideIcon,
} from 'lucide-react';
import {
  SECCIONES_FORMULARIO,
  type CampoFormulario,
  type ErroresFormulario,
  type EstadoFormularioProducto,
  type SeccionFormulario,
} from '../logica/formularioProducto';

/** Icono de cada sección (índice lateral, acordeón y marco). */
export const ICONO_SECCION: Record<SeccionFormulario, LucideIcon> = {
  informacion: Package,
  precios: CircleDollarSign,
  impuestos: Percent,
  inventario: Boxes,
  variantes: Split,
  modificadores: SlidersHorizontal,
  imagenes: ImageIcon,
  codigos: Barcode,
  organizacion: Store,
  avanzado: Settings2,
};

/** Un servicio no maneja inventario: la sección desaparece. */
export function seccionesVisibles(estado: EstadoFormularioProducto | null): SeccionFormulario[] {
  return SECCIONES_FORMULARIO.filter((s) => !(s === 'inventario' && estado?.product_type === 'service'));
}

// ── Stepper móvil (crear y duplicar) ────────────────────────────────────────

export type PasoMovil = 'esencial' | 'inventario' | 'detalles';

export const PASOS_MOVIL: readonly PasoMovil[] = ['esencial', 'inventario', 'detalles'];

/** Paso del stepper donde vive cada campo (para llevar al primero con error). */
export const PASO_DE_CAMPO: Record<CampoFormulario, PasoMovil> = {
  sku: 'esencial',
  name: 'esencial',
  category_id: 'esencial',
  price: 'esencial',
  imagenes: 'esencial',
  compare_price: 'inventario',
  cost: 'inventario',
  precio_desde: 'inventario',
  impuestos: 'inventario',
  stock: 'inventario',
  serial_pattern: 'inventario',
  warranty_months: 'inventario',
  variantes: 'detalles',
  modificadores: 'detalles',
  barcode: 'detalles',
  proveedor: 'detalles',
  dimensiones: 'detalles',
  receta: 'detalles',
};

export function primerPasoConError(errores: ErroresFormulario): PasoMovil | null {
  const pasos = new Set((Object.keys(errores) as CampoFormulario[]).map((c) => PASO_DE_CAMPO[c]));
  return PASOS_MOVIL.find((p) => pasos.has(p)) ?? null;
}

/**
 * Acordeón del paso 3 («Más detalles»). Imágenes va entera en el paso 1
 * (imagen principal y el resto): montarla dos veces duplicaría su estado.
 */
export const SECCIONES_PASO_DETALLES: readonly SeccionFormulario[] = [
  'variantes',
  'modificadores',
  'codigos',
  'organizacion',
  'avanzado',
];
