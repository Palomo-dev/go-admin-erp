'use client';

import ModuleRootRedirect from '@/components/inicio/ModuleRootRedirect';

/**
 * /app/parking redirige a la primera página activa del módulo Parking.
 * El dashboard de Parking se consolidó en /app/inicio#parking.
 */
export default function ParkingPage() {
  return <ModuleRootRedirect moduleCode="parking" />;
}
