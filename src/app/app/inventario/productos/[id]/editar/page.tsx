'use client';

import { useParams } from 'next/navigation';
import { ProductoForm } from '@/components/inventario/productos/formulario/ProductoForm';

/**
 * Editar producto. El parámetro de la URL es el id numérico o el uuid; se
 * resuelve dentro de la organización de la sesión
 * (`ProductoForm` → `fn_producto_para_formulario`).
 */
export default function EditarProductoPage() {
  const params = useParams();
  const ident = (params?.id as string) ?? '';
  return <ProductoForm key={ident} modo="editar" productUuid={ident} />;
}
