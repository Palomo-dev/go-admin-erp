'use client';

import { ProveedorForm } from '../ProveedorForm';

interface EditarProveedorFormProps {
  supplierUuid: string;
}

/**
 * Edición de proveedor con el mismo formulario del alta (`ProveedorForm`).
 * Antes era una copia con 5 controles menos que, al guardar, forzaba el
 * código DIAN «31»/«1» y editaba como texto plano el HTML de la descripción.
 */
export function EditarProveedorForm({ supplierUuid }: EditarProveedorFormProps) {
  return <ProveedorForm modo="editar" supplierUuid={supplierUuid} />;
}

export default EditarProveedorForm;
