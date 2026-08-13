'use client';

import ModuleRootRedirect from '@/components/inicio/ModuleRootRedirect';

/**
 * /app/transporte redirige a la primera página activa del módulo Transporte.
 * El dashboard de Transporte se consolidó en /app/inicio#transport.
 */
export default function TransportePage() {
  return <ModuleRootRedirect moduleCode="transport" />;
}
