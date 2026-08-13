'use client';

import ModuleRootRedirect from '@/components/inicio/ModuleRootRedirect';

/**
 * /app/pms redirige a la primera página activa del módulo PMS Hotel.
 * El dashboard de PMS se consolidó en /app/inicio#pms_hotel.
 */
export default function PmsPage() {
  return <ModuleRootRedirect moduleCode="pms_hotel" />;
}
