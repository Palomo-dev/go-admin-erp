'use client';

import { ProveedorForm } from '../ProveedorForm';
import { SinPermisoFormulario } from '../sinPermisoFormulario';
import { usePermisosCatalogo } from '@/components/inventario/categorias/usePermisosCatalogo';

interface EditarProveedorFormProps {
  supplierUuid: string;
}

/**
 * Edición de proveedor con el mismo formulario del alta (`ProveedorForm`).
 * Antes era una copia con 5 controles menos que, al guardar, forzaba el
 * código DIAN «31»/«1» y editaba como texto plano el HTML de la descripción.
 * Sin el permiso de editar del catálogo muestra «sin permiso».
 */
export function EditarProveedorForm({ supplierUuid }: EditarProveedorFormProps) {
  const permisos = usePermisosCatalogo();
  if (permisos.resueltos && !permisos.editar) return <SinPermisoFormulario />;
  return <ProveedorForm modo="editar" supplierUuid={supplierUuid} />;
}

export default EditarProveedorForm;
