'use client';

import { ProveedorForm } from '../ProveedorForm';
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
 */
export function NuevoProveedorForm({ onSuccess, onCancel, embedded = false }: NuevoProveedorFormProps = {}) {
  return <ProveedorForm modo="nuevo" onSuccess={onSuccess} onCancel={onCancel} embedded={embedded} />;
}

export default NuevoProveedorForm;
