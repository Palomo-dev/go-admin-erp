'use client';

import { useParams } from 'next/navigation';
import { ProductoForm } from '@/components/inventario/productos/formulario/ProductoForm';

/**
 * Editar producto. El id de la URL es el uuid; el producto se busca dentro de
 * la organización de la sesión (`ProductoForm` → `fn_producto_para_formulario`).
 */
export default function EditarProductoPage() {
  const params = useParams();
  const uuid = (params?.id as string) ?? '';
  return <ProductoForm key={uuid} modo="editar" productUuid={uuid} />;
}
