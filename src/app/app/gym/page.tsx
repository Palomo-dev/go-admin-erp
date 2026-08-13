'use client';

import ModuleRootRedirect from '@/components/inicio/ModuleRootRedirect';

/**
 * /app/gym redirige a la primera página activa del módulo Gym.
 * El dashboard de Gym se consolidó en /app/inicio#gym.
 */
export default function GymPage() {
  return <ModuleRootRedirect moduleCode="gym" />;
}
