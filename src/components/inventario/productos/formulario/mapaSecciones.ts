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
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import {
  esMembresia,
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
  membresia: UserCheck,
  inventario: Boxes,
  variantes: Split,
  modificadores: SlidersHorizontal,
  imagenes: ImageIcon,
  codigos: Barcode,
  organizacion: Store,
  avanzado: Settings2,
};

/**
 * Un servicio no maneja inventario: la sección desaparece. «Configuración de
 * membresía» solo aparece si es un servicio de tipo membresía.
 */
export function seccionesVisibles(estado: EstadoFormularioProducto | null): SeccionFormulario[] {
  return SECCIONES_FORMULARIO.filter((s) => {
    if (s === 'inventario') return estado?.product_type !== 'service';
    if (s === 'membresia') return !!estado && esMembresia(estado);
    return true;
  });
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
  service_type: 'esencial',
  // «Cómo se vende» va con el precio de venta (paso 1, Figma P6).
  modo_venta: 'esencial',
  // Móvil: la configuración de la membresía vive en el paso 2 (Figma A2 980:1146).
  membresia_duracion: 'inventario',
  membresia_cobro: 'inventario',
  membresia_gracia: 'inventario',
  membresia_activacion: 'inventario',
  membresia_congelamiento: 'inventario',
  membresia_sedes: 'inventario',
  membresia_horario: 'inventario',
  membresia_entradas: 'inventario',
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
