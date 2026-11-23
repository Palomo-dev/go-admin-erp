'use client';

import ModuleRootRedirect from '@/components/inicio/ModuleRootRedirect';

/** /app/logistica redirige a la primera página activa del módulo Logística (Por despachar). */
export default function LogisticaPage() {
  return <ModuleRootRedirect moduleCode="logistica" />;
}
