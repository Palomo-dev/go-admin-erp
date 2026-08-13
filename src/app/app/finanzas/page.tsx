'use client';

import ModuleRootRedirect from '@/components/inicio/ModuleRootRedirect';

/**
 * /app/finanzas redirige a la primera página activa del módulo Finanzas.
 * El dashboard de Finanzas se consolidó en /app/inicio#finance.
 */
export default function FinanzasPage() {
  return <ModuleRootRedirect moduleCode="finance" />;
}
