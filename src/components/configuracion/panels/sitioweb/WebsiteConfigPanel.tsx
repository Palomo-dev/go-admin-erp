'use client';

/**
 * Configuración › Sitio web.
 *
 * Antes era una SEGUNDA copia del módulo (siete pestañas Branding*Tab con su propio cargar y
 * guardar de `website_settings`, y escrituras desde el navegador). Regla 7: una sola
 * implementación. La entrada se conserva en Configuración general (lo pidió el dueño), pero
 * aquí solo se enlaza a las pantallas del módulo, que son el único lugar donde se edita.
 *
 * Las rutas, nombres e iconos salen del catálogo de navegación (`moduloPorCodigo('website')`):
 * no hay una lista propia de páginas.
 */
import { Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { RelatedLinkCard } from '@/components/kit';
import { clavePagina, moduloPorCodigo } from '@/lib/navigation/catalog';
import { RAIZ_SITIO_WEB } from '@/components/sitio-web/rutasSitioWeb';
import { useTextosConfiguracion } from '@/components/sitio-web/configuracion/textos';

/** Páginas del módulo a las que se llega desde Configuración general (las del grupo «Ajustes del sitio» sin capacidad extra, y el Resumen). */
function paginasEnlazadas() {
  const paginas = moduloPorCodigo('website')?.paginas ?? [];
  return paginas.filter((p) => p.href === RAIZ_SITIO_WEB || (p.grupo === 'Ajustes del sitio' && !p.requiere));
}

export function WebsiteConfigPanel() {
  const t = useTextosConfiguracion();
  const tNav = useTranslations('nav');
  const paginas = paginasEnlazadas();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-secondary">
          <Globe aria-hidden="true" className="size-5" strokeWidth={1.5} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-6 text-fg">{t('enConfiguracionGeneral.titulo')}</h2>
          <p className="text-[13px] leading-[18px] text-fg-secondary">{t('enConfiguracionGeneral.descripcion')}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {paginas
          .slice()
          .reverse()
          .map((p) => {
            const clave = `paginas.${clavePagina(p.href)}`;
            const nombre = tNav.has(clave) ? tNav(clave) : p.nombre;
            return (
              <RelatedLinkCard
                key={p.href}
                icono={p.icono}
                etiqueta={nombre}
                valor={p.href === RAIZ_SITIO_WEB ? t('enConfiguracionGeneral.resumen') : t('enConfiguracionGeneral.configuracion')}
                href={p.href}
                textoAccion={t('enConfiguracionGeneral.abrir')}
              />
            );
          })}
      </div>
    </div>
  );
}
