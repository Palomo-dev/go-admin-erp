'use client';

/**
 * Marco común de las pantallas de Organización (Figma 08): PageHeader del kit
 * con migas «Organización › …», y los estados de acceso resueltos en el
 * servidor — cargando (esqueleto), error (con «Reintentar») y sin permiso (con
 * salida: «Volver al inicio» y a quién pedir acceso). Antes cada página tenía
 * su caja amarilla «Sin permisos» sin salida y su caja roja con el mensaje
 * técnico (auditoría 2026-10, P2-4).
 */
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState, PageHeader, type PageHeaderMovil } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { cumplePermiso, useAccesoOrganizacion, type AccesoOrganizacion, type PermisoOrganizacion } from './useAccesoOrganizacion';

export interface PantallaOrganizacionProps {
  titulo: string;
  subtitulo?: ReactNode;
  icono: LucideIcon;
  permiso: PermisoOrganizacion;
  acciones?: ReactNode;
  badge?: ReactNode;
  /** Fila bajo la cabecera (pestañas). Se ve también en móvil. */
  debajo?: ReactNode;
  movil?: PageHeaderMovil;
  /** La página está cargando sus propios datos (gira el subtítulo). */
  cargandoDatos?: boolean;
  /** Esqueleto mientras se resuelve el acceso. */
  esqueleto?: ReactNode;
  children: (ctx: { organizationId: number; acceso: AccesoOrganizacion }) => ReactNode;
}

export function EsqueletoOrganizacion({ filas = 6 }: { filas?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Skeleton className="h-10 w-full max-w-xl" />
      <div className="rounded-xl border border-line bg-surface p-4">
        {Array.from({ length: filas }).map((_, i) => (
          <Skeleton key={i} className="mb-3 h-8 w-full last:mb-0" />
        ))}
      </div>
    </div>
  );
}

export function PantallaOrganizacion({
  titulo,
  subtitulo,
  icono,
  permiso,
  acciones,
  badge,
  debajo,
  movil,
  cargandoDatos,
  esqueleto,
  children,
}: PantallaOrganizacionProps) {
  const t = useTranslations('org.acceso.comun');
  const acceso = useAccesoOrganizacion();
  const migas = [{ etiqueta: t('organizacion'), href: '/app/organizacion' }, { etiqueta: titulo }];
  const listo = !acceso.cargando && !acceso.error && acceso.organizationId !== null;
  const permitido = listo && cumplePermiso(acceso, permiso);

  let cuerpo: ReactNode;
  if (acceso.error) {
    cuerpo = (
      <EmptyState
        variante="error"
        titulo={t('error.titulo')}
        descripcion={t('error.descripcion')}
        onReintentar={acceso.recargar}
      />
    );
  } else if (!listo) {
    cuerpo = (
      <>
        <span className="sr-only" role="status">
          {t('cargando')}
        </span>
        {esqueleto ?? <EsqueletoOrganizacion />}
      </>
    );
  } else if (!permitido) {
    cuerpo = (
      <EmptyState
        variante="forbidden"
        titulo={t('sinPermiso.titulo')}
        descripcion={t('sinPermiso.descripcion')}
        accion={{ etiqueta: t('sinPermiso.inicio'), href: '/app/inicio' }}
        accionSecundaria={
          permiso === 'miembro' ? undefined : { etiqueta: t('sinPermiso.misOrganizaciones'), href: '/app/organizacion/mis-organizaciones' }
        }
      />
    );
  } else {
    cuerpo = children({ organizationId: acceso.organizationId as number, acceso });
  }

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-4 bg-canvas p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
      <PageHeader
        titulo={titulo}
        subtitulo={permitido ? subtitulo : undefined}
        icono={icono}
        migas={migas}
        badge={permitido ? badge : undefined}
        acciones={permitido ? acciones : undefined}
        debajo={permitido ? debajo : undefined}
        cargando={acceso.cargando || (permitido && cargandoDatos)}
        movil={permitido ? movil : {}}
      />
      {cuerpo}
    </div>
  );
}
