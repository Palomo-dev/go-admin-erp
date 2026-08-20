'use client';

import ModuleRootRedirect from '@/components/inicio/ModuleRootRedirect';

/**
 * /app/integraciones redirige a la primera página activa del módulo Integraciones.
 * El dashboard de Integraciones se consolidó en /app/inicio#integrations.
 */
export default function IntegracionesPage() {
  return <ModuleRootRedirect moduleCode="integrations" />;
}
