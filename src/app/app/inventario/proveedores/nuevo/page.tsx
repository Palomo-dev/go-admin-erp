import { NuevoProveedorForm } from '@/components/inventario/proveedores/nuevo';

export default function NuevoProveedorPage() {
  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <NuevoProveedorForm />
    </div>
  );
}
