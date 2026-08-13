'use client';

/**
 * Componente cliente que redirige la raíz de un módulo (ej: /app/crm) a la
 * primera página activa de ese módulo para la organización actual.
 *
 * Si el módulo no tiene páginas activas, redirige a /app/inicio.
 *
 * Usado por las 15 raíces de módulos de negocio tras la consolidación de
 * dashboards en /app/inicio.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { resolveModuleRootRedirect, getStaticFirstPageHref } from '@/lib/utils/moduleRedirect';
import { PageHeaderSkeleton } from '@/components/common/PageSkeletons';

interface ModuleRootRedirectProps {
  /** Código del módulo (ej: 'crm', 'finance', 'inventory') */
  moduleCode: string;
}

export default function ModuleRootRedirect({ moduleCode }: ModuleRootRedirectProps) {
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const performRedirect = async () => {
      const organizationId = getOrganizationId();

      // Sin organización: fallback estático o inicio
      if (!organizationId || organizationId === 0) {
        const staticHref = getStaticFirstPageHref(moduleCode);
        if (!cancelled) router.replace(staticHref ?? '/app/inicio');
        return;
      }

      try {
        const target = await resolveModuleRootRedirect(moduleCode, organizationId);
        if (!cancelled) router.replace(target);
      } catch (err) {
        console.error(`Error resolviendo redirect para módulo ${moduleCode}:`, err);
        if (!cancelled) {
          const staticHref = getStaticFirstPageHref(moduleCode);
          if (staticHref) {
            router.replace(staticHref);
          } else {
            setError(true);
          }
        }
      }
    };

    performRedirect();

    return () => {
      cancelled = true;
    };
  }, [moduleCode, router]);

  if (error) {
    return (
      <div className="p-6 min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No se pudo redirigir a la página del módulo.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <PageHeaderSkeleton />
    </div>
  );
}
