'use client';

import ModuleRootRedirect from '@/components/inicio/ModuleRootRedirect';

/**
 * /app/inventario redirige a la primera página activa del módulo Inventario.
 * El dashboard de Inventario se consolidó en /app/inicio#inventory.
 */
export default function InventarioPage() {
  return <ModuleRootRedirect moduleCode="inventory" />;
}
