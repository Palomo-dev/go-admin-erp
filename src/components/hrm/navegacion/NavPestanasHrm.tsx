'use client';

/**
 * Pestañas del módulo Recursos humanos (Figma 20, decisión 1 del dueño):
 * Empleados · Áreas · Cargos · Plazas · Aprobaciones.
 *
 * - La lista NO se cablea: sale del catálogo de navegación ya filtrado por la
 *   organización y el cargo (`usePaginasModulo('hrm')`), igual que el menú.
 * - «Aprobaciones» lleva contador y solo la ve quien tiene algo por aprobar
 *   (o quien ya está en ella). El contador lo da `GET /api/hrm/aprobaciones`.
 * - Las páginas de detalle y de formulario no la muestran: las migas la
 *   reemplazan (`muestraPestanasHrm`).
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { Skeleton } from '@/components/ui/skeleton';
import { moduloPorCodigo, type PaginaNav } from '@/lib/navigation/catalog';
import { usePaginasModulo, useNavegacionVisible } from '@/lib/navigation/NavegacionVisible';
import { useNombresNav } from '@/lib/navigation/useNombresNav';
import { useDesplazamientoHorizontal } from '@/components/kit/useDesplazamientoHorizontal';
import { PESTANAS_HRM, RUTA_APROBACIONES_HRM, mostrarPestanaAprobaciones, pestanaHrmActiva } from './navHrmLogica';

/** `incrustada`: dentro del `debajo` del PageHeader (Figma corregido); si no, barra a todo el ancho. */
export function NavPestanasHrm({ className, incrustada = false }: { className?: string; incrustada?: boolean }) {
  const pathname = usePathname() ?? '';
  const t = useTranslations('hrmPersonas.pestanas');
  const nombres = useNombresNav();
  const nav = useNavegacionVisible();
  const visibles = usePaginasModulo('hrm');
  const [pendientes, setPendientes] = useState<number | null>(null);

  useEffect(() => {
    let vigente = true;
    fetch('/api/hrm/aprobaciones', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { pendientes?: unknown[] } | null) => vigente && setPendientes(Array.isArray(d?.pendientes) ? d.pendientes.length : 0))
      .catch(() => vigente && setPendientes(0));
    return () => {
      vigente = false;
    };
  }, [pathname]);

  const catalogo = moduloPorCodigo('hrm')?.paginas ?? [];
  const base: PaginaNav[] | null = nav ? visibles : catalogo;
  const paginas =
    base === null
      ? null
      : PESTANAS_HRM.map((href) => base.find((p) => p.href === href) ?? (href === RUTA_APROBACIONES_HRM ? catalogo.find((p) => p.href === href) : undefined))
          .filter((p): p is PaginaNav => !!p)
          .filter((p) => p.href !== RUTA_APROBACIONES_HRM || mostrarPestanaAprobaciones(pendientes, pathname));
  const activa = pestanaHrmActiva(pathname);
  const barra = useDesplazamientoHorizontal<HTMLElement>('[aria-current="page"]', activa);

  return (
    <div className={cn('flex w-full items-center border-b border-line', incrustada ? '' : 'bg-surface px-4 lg:px-6', className)}>
      <nav
        ref={barra}
        aria-label={t('etiqueta')}
        className="-mb-px flex min-w-0 flex-1 items-end gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {paginas === null
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="my-3 h-5 w-20 shrink-0" />)
          : paginas.map((p) => {
              const esActiva = p.href === activa;
              const contador = p.href === RUTA_APROBACIONES_HRM && pendientes ? pendientes : null;
              return (
                <Link
                  key={p.href}
                  href={p.href}
                  aria-current={esActiva ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
                    esActiva ? 'border-brand text-brand-deep' : 'border-transparent text-fg-secondary hover:text-fg'
                  )}
                >
                  {nombres.pagina(p)}
                  {contador ? (
                    <span
                      aria-label={t('pendientes', { n: contador })}
                      className={cn(
                        'rounded-full px-1.5 text-xs tabular-nums',
                        esActiva ? 'bg-brand-tint text-brand-deep' : 'bg-subtle text-fg-secondary'
                      )}
                    >
                      {contador}
                    </span>
                  ) : null}
                </Link>
              );
            })}
      </nav>
    </div>
  );
}
