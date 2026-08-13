'use client';

import ModuleRootRedirect from '@/components/inicio/ModuleRootRedirect';

/**
 * /app/hrm redirige a la primera página activa del módulo HRM.
 * El dashboard de HRM se consolidó en /app/inicio#hrm.
 */
export default function HrmPage() {
  return <ModuleRootRedirect moduleCode="hrm" />;
}
