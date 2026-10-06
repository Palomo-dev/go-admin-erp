'use client';

/**
 * Marco común de las subpáginas del módulo «Sitio web» (/app/sitio-web/**):
 * cabecera con migas «Sitio web › <página>», título e icono SACADOS DEL
 * CATÁLOGO de navegación (el mismo nombre que el menú lateral, sin lista
 * propia) y el contenido debajo.
 *
 * `EstadoAjustes` cubre la carga y el error de `website_settings` para las
 * subpáginas que lo editan (Resumen, Diseño, Plantillas, SEO, Configuración).
 */
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { moduloPorCodigo } from '@/lib/navigation/catalog';
import { useNombresNav } from '@/lib/navigation/useNombresNav';

/** Código del módulo en `modules` (y en el catálogo de navegación). */
export const CODIGO_MODULO_SITIO_WEB = 'website';

interface MarcoSitioWebProps {
  /** Ruta de la subpágina tal como está en el catálogo (`/app/sitio-web/diseno`). */
  href: string;
  subtitulo?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
}

export function MarcoSitioWeb({ href, subtitulo, acciones, children }: MarcoSitioWebProps) {
  const tNav = useTranslations('nav');
  const nombres = useNombresNav();
  const modulo = moduloPorCodigo(CODIGO_MODULO_SITIO_WEB);
  const pagina = modulo?.paginas.find((p) => p.href === href);
  const titulo = pagina ? nombres.pagina(pagina) : tNav(modulo?.etiqueta ?? 'sitioWeb');
  const raiz = modulo?.rutas[0] ?? '/app/sitio-web';
  const nombreModulo = tNav(modulo?.etiqueta ?? 'sitioWeb');

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-4 bg-canvas p-4 lg:gap-6 lg:p-6">
      <PageHeader
        titulo={titulo}
        subtitulo={subtitulo}
        icono={pagina?.icono ?? modulo?.icono}
        migas={href === raiz ? [{ etiqueta: nombreModulo }] : [{ etiqueta: nombreModulo, href: raiz }, { etiqueta: titulo }]}
        acciones={acciones}
      />
      {children}
    </div>
  );
}

interface EstadoAjustesProps {
  cargando: boolean;
  hayAjustes: boolean;
  onReintentar: () => void;
  children: ReactNode;
}

export function EstadoAjustes({ cargando, hayAjustes, onReintentar, children }: EstadoAjustesProps) {
  const t = useTranslations('org.branding');
  if (cargando) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-busy="true">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    );
  }
  if (!hayAjustes) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">{t('errorLoadingConfigEmpty')}</p>
        <Button onClick={onReintentar}>
          <RefreshCw className="mr-2 size-4" aria-hidden="true" />
          {t('retry')}
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}
