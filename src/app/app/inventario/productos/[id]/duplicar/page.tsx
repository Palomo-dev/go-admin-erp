'use client';

import { useParams } from 'next/navigation';
import { ProductoForm } from '@/components/inventario/productos/formulario/ProductoForm';

/**
 * Duplicar producto: primero «Qué copiar» (variantes, precios, costos,
 * imágenes, etiquetas, impuestos, modificadores, proveedores, categorías;
 * el stock arranca en 0) y después el formulario único prellenado.
 */
export default function DuplicarProductoPage() {
  const params = useParams();
  const ident = (params?.id as string) ?? '';
  return <ProductoForm key={ident} modo="duplicar" productUuid={ident} />;
}
