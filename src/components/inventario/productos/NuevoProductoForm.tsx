'use client';

import { ProductoForm, type ProductoGuardadoResumen } from './formulario/ProductoForm';

/**
 * Envoltorio histórico del alta de producto: hoy es el formulario único
 * (`ProductoForm` en modo «crear»). `embedded` lo pinta para un diálogo.
 */
export interface NuevoProductoFormWrapperProps {
  onSuccess?: (producto: ProductoGuardadoResumen) => void;
  onCancel?: () => void;
  embedded?: boolean;
}

export default function NuevoProductoFormWrapper({ onSuccess, onCancel, embedded = false }: NuevoProductoFormWrapperProps = {}) {
  return <ProductoForm modo="crear" layout={embedded ? 'dialog' : 'page'} onSuccess={onSuccess} onCancel={onCancel} />;
}
