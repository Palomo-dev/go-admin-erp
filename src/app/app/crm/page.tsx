'use client';

import ModuleRootRedirect from '@/components/inicio/ModuleRootRedirect';

/**
 * /app/crm redirige a la primera página activa del módulo CRM.
 * El dashboard de CRM se consolidó en /app/inicio#crm.
 */
export default function CrmPage() {
  return <ModuleRootRedirect moduleCode="crm" />;
}
