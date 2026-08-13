'use client';

import ModuleRootRedirect from '@/components/inicio/ModuleRootRedirect';

/**
 * /app/pm redirige a la primera página activa del módulo Project Management.
 * El dashboard de PM se consolidó en /app/inicio#pm.
 */
export default function PmPage() {
  return <ModuleRootRedirect moduleCode="pm" />;
}
