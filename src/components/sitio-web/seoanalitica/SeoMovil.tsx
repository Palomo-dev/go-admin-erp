'use client';

/**
 * «SEO y redes» en el móvil (Figma B/08-03): vista previa de una red a la vez
 * y filas con su resumen que abren cada sección en una hoja (`PanelAdaptable`)
 * con el MISMO componente de sección del escritorio. La barra de guardado la
 * pone la página (fija abajo en móvil).
 */
import { useState } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { PanelAdaptable, clasesBoton } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { VistaPreviaCompartir } from './VistaPreviaCompartir';
import { SeccionTituloDescripcion } from './SeccionTituloDescripcion';
import { SeccionImagenCompartir } from './SeccionImagenCompartir';
import { SeccionRedesSociales } from './SeccionRedesSociales';
import { SeccionGoogle } from './SeccionGoogle';
import { CalidadSeoPaginas } from './CalidadSeoPaginas';
import { LIMITE_DESCRIPCION, LIMITE_TITULO, resumenSeo } from './seoLogica';
import { useTextosSeoAnalitica } from './textos';
import { ICONO_NIVEL, ICONO_SECCION_SEO } from './iconosSeoAnalitica';
import { CajaIcono } from '../ui/CajaIcono';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';
import type { SeoSitio } from './useSeoSitio';
import type { SaludSeo } from './useSaludSeo';

type Hoja = 'titulo' | 'imagen' | 'redes' | 'google' | 'calidad';

export function SeoMovil({ s, salud, host }: { s: SeoSitio; salud: SaludSeo; host: string | null }) {
  const t = useTextosSeoAnalitica();
  const [hoja, setHoja] = useState<Hoja | null>(null);
  const f = s.formulario;
  const r = resumenSeo(f, !!s.base.verificacion, s.paginas);

  const calidad =
    r.calidad.sinDescripcion === 1
      ? t('seo.movil.calidadUna')
      : r.calidad.sinDescripcion > 1
        ? t('seo.movil.calidadVarias', { n: r.calidad.sinDescripcion })
        : r.calidad.mejorables > 0
          ? t('seo.movil.calidadMejorables', { n: r.calidad.mejorables })
          : t('seo.movil.calidadBien');

  const filas: Array<{ id: Hoja; titulo: string; detalle: string; aviso?: boolean; icono: LucideIcon }> = [
    {
      id: 'titulo',
      titulo: t('seo.movil.tituloDescripcion'),
      detalle: `${r.tituloDescripcion.titulo} / ${LIMITE_TITULO} · ${r.tituloDescripcion.descripcion} / ${LIMITE_DESCRIPCION}`,
      icono: ICONO_SECCION_SEO.titulo,
    },
    { id: 'imagen', titulo: t('seo.movil.imagen'), detalle: r.imagenLista ? t('seo.movil.imagenLista') : t('seo.movil.imagenFalta'), aviso: !r.imagenLista, icono: ICONO_SECCION_SEO.imagen },
    {
      id: 'redes',
      titulo: t('seo.movil.redes'),
      detalle: r.redes.length > 0 ? r.redes.map((red) => t(`seo.redes.${red}`)).join(', ') : t('seo.movil.redesNinguna'),
      icono: ICONO_SECCION_SEO.redes,
    },
    { id: 'google', titulo: t('seo.movil.google'), detalle: r.verificado ? t('seo.movil.googleCodigoGuardado') : t('seo.movil.googleSinVerificar'), icono: ICONO_SECCION_SEO.google },
    { id: 'calidad', titulo: t('seo.movil.calidad'), detalle: calidad, aviso: r.calidad.sinDescripcion > 0 || r.calidad.mejorables > 0, icono: ICONO_SECCION_SEO.calidad },
  ];
  const actual = filas.find((x) => x.id === hoja);

  return (
    <div className="flex flex-col gap-4 pb-20">
      <VistaPreviaCompartir host={host} titulo={f.titulo} descripcion={f.descripcion} imagen={f.imagen} modo="una" sinTarjeta />
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface" data-testid="filas-seo-movil">
        {filas.map((x) => (
          <li key={x.id}>
            <button
              type="button"
              onClick={() => setHoja(x.id)}
              className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
            >
              {/* Caja de 40 con icono de 20: el mismo de la sección en escritorio y del título de la hoja. */}
              <CajaIcono icono={x.icono} tono={x.aviso ? 'advertencia' : 'neutro'} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-fg">{x.titulo}</span>
                <span className={cn('flex min-w-0 items-center gap-1 text-xs tabular-nums', x.aviso ? 'text-warning-text' : 'text-fg-secondary')}>
                  {x.aviso && <ICONO_NIVEL.mejorable aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.meta, 'shrink-0')} strokeWidth={TRAZO_ICONO} />}
                  <span className="truncate">{x.detalle}</span>
                </span>
              </span>
              <ChevronRight aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'shrink-0 text-fg-muted')} strokeWidth={TRAZO_ICONO} />
            </button>
          </li>
        ))}
      </ul>
      <PanelAdaptable
        abierto={hoja !== null}
        onAbiertoChange={(v) => !v && setHoja(null)}
        titulo={actual?.titulo ?? ''}
        icono={actual?.icono}
        pie={
          <button type="button" onClick={() => setHoja(null)} className={clasesBoton({ variante: 'primario', tamano: 'md' }) + ' w-full'}>
            {t('seo.movil.listo')}
          </button>
        }
      >
        {hoja === 'titulo' && <SeccionTituloDescripcion s={s} sinCabecera />}
        {hoja === 'imagen' && <SeccionImagenCompartir s={s} sinCabecera />}
        {hoja === 'redes' && <SeccionRedesSociales s={s} sinCabecera />}
        {hoja === 'google' && <SeccionGoogle s={s} salud={salud} sinCabecera />}
        {hoja === 'calidad' && <CalidadSeoPaginas paginas={s.paginas} productos={s.servidor?.productos ?? null} sinTarjeta />}
      </PanelAdaptable>
    </div>
  );
}
