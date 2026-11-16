'use client';

/**
 * Pestañas del módulo Recursos humanos (Figma 20, decisión 1 del dueño):
 * - RR. HH.: Empleados · Áreas · Cargos · Plazas · Turnos · Asistencia ·
 *   Novedades · Ausencias · Aprobaciones;
 * - el jefe: Mi equipo · Turnos · Asistencia · Novedades · Ausencias · Aprobaciones.
 *
 * - Qué vista corresponde y los contadores (Empleados, Novedades, Mi equipo)
 *   los decide el servidor: `GET /api/hrm/pestanas`.
 * - La lista NO se cablea por permisos: cada pestaña sale del catálogo de
 *   navegación ya filtrado por la organización y el cargo
 *   (`usePaginasModulo('hrm')`), igual que el menú.
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
import {
  RUTA_APROBACIONES_HRM,
  RUTA_MI_EQUIPO,
  RUTA_NOVEDADES_HRM,
  contadorDePestana,
  mostrarPestanaAprobaciones,
  pestanaHrmActiva,
  pestanasDeVista,
  type ContadoresPestanas,
  type VistaPestanas,
} from './navHrmLogica';

/** `incrustada`: dentro del `debajo` del PageHeader (Figma corregido); si no, barra a todo el ancho. */
export function NavPestanasHrm({ className, incrustada = false }: { className?: string; incrustada?: boolean }) {
  const pathname = usePathname() ?? '';
  const t = useTranslations('hrmPersonas.pestanas');
  const tEq = useTranslations('hrmEquipo');
  const nombres = useNombresNav();
  const nav = useNavegacionVisible();
  const visibles = usePaginasModulo('hrm');
  const [pendientes, setPendientes] = useState<number | null>(null);
  const [vista, setVista] = useState<{ vista: VistaPestanas; contadores: ContadoresPestanas } | null>(null);

  useEffect(() => {
    let vigente = true;
    fetch('/api/hrm/pestanas', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { vista?: VistaPestanas; contadores?: ContadoresPestanas } | null) =>
        vigente && setVista({ vista: d?.vista ?? 'ninguna', contadores: d?.contadores ?? {} })
      )
      .catch(() => vigente && setVista({ vista: 'ninguna', contadores: {} }));
    return () => {
      vigente = false;
    };
  }, [pathname]);

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
  // Aprobaciones no va en el menú y «Mi equipo» la decide el servidor: si el
  // catálogo filtrado no las trae, se toman del catálogo completo.
  const sinMenu = (href: string) => href === RUTA_APROBACIONES_HRM || (href === RUTA_MI_EQUIPO && vista?.vista === 'jefe');
  const paginas =
    base === null || vista === null
      ? null
      : pestanasDeVista(vista.vista)
          .map((href) => base.find((p) => p.href === href) ?? (sinMenu(href) ? catalogo.find((p) => p.href === href) : undefined))
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
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="my-3 h-5 w-20 shrink-0" />)
          : paginas.map((p) => {
              const esActiva = p.href === activa;
              const contador = contadorDePestana(p.href, vista?.contadores ?? null, pendientes);
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
                      aria-label={
                        p.href === RUTA_APROBACIONES_HRM || p.href === RUTA_NOVEDADES_HRM
                          ? t('pendientes', { n: contador })
                          : tEq('pestanaPersonas', { n: contador })
                      }
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
