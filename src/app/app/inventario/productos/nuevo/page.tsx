'use client';

import { ProductoForm } from '@/components/inventario/productos/formulario/ProductoForm';

/**
 * Nuevo producto: el formulario único (`ProductoForm`) pinta su propia
 * cabecera (PageHeader `form` con migas y «Guardar» en la cabecera móvil),
 * porque el guardado y el paso del stepper viven dentro del formulario.
 */
export default function NuevoProductoPage() {
  return <ProductoForm modo="crear" />;
}
