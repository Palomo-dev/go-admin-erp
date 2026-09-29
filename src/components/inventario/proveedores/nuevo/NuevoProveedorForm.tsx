'use client';

import { ProveedorForm } from '../ProveedorForm';
import { SinPermisoFormulario } from '../sinPermisoFormulario';
import { usePermisosCatalogo } from '@/components/inventario/categorias/usePermisosCatalogo';
import type { Supplier } from '@/lib/services/supplierService';

interface NuevoProveedorFormProps {
  /** Cuando se provee, tras crear el proveedor se llama en lugar de navegar (uso en diálogos). */
  onSuccess?: (supplier: Supplier) => void;
  /** Botón «Cancelar» cuando se usa embebido. */
  onCancel?: () => void;
  /** Modo embebido: sin cabecera de página y con los botones al pie (diálogos). */
  embedded?: boolean;
}

/**
 * Alta de proveedor. Es el mismo formulario que la edición (`ProveedorForm`):
 * así el alta y la edición no vuelven a divergir (auditoría §A.7 y §G.1).
 * Como página, sin el permiso de crear del catálogo muestra «sin permiso»;
 * embebido (alta rápida desde una compra) lo decide quien lo abre.
 */
export function NuevoProveedorForm({ onSuccess, onCancel, embedded = false }: NuevoProveedorFormProps = {}) {
  const permisos = usePermisosCatalogo();
  if (!embedded && permisos.resueltos && !permisos.crear) return <SinPermisoFormulario />;
  return <ProveedorForm modo="nuevo" onSuccess={onSuccess} onCancel={onCancel} embedded={embedded} />;
}

export default NuevoProveedorForm;
