'use client';

/**
 * «Imagen para compartir» (Figma B/08-01): miniatura con el chip «Principal»,
 * quitar y cambiar, casilla «+» para agregar y el pie «N de M». Elige con el
 * selector de imágenes existente (`ImagePickerDialog`, cargado al abrirlo).
 *
 * El contrato del sitio guarda UNA imagen (`seo.imagenOgUrl`); por eso hoy el
 * máximo es 1 (`MAX_IMAGENES_COMPARTIR`). Ordenar varias, el texto
 * alternativo y «Generar con IA» esperan a que el contrato lo admita.
 */
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { FormSection, clasesBoton } from '@/components/kit';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { MAX_IMAGENES_COMPARTIR } from './seoLogica';
import { useTextosSeoAnalitica } from './textos';
import { ICONO_ACCION_SEO, ICONO_SECCION_SEO } from './iconosSeoAnalitica';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';
import type { SeoSitio } from './useSeoSitio';

const ImagePickerDialog = dynamic(() => import('@/components/common/ImagePickerDialog'), { ssr: false });

export function SeccionImagenCompartir({ s, sinCabecera }: { s: SeoSitio; sinCabecera?: boolean }) {
  const t = useTextosSeoAnalitica();
  const { organization } = useOrganization();
  const [selector, setSelector] = useState(false);
  const imagen = s.formulario.imagen;
  const imagenes = imagen ? [imagen] : [];

  const contenido = (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-3" aria-label={t('seo.imagen.seccion')}>
        {imagenes.map((url) => (
          <li key={url} className="relative flex w-[132px] flex-col overflow-hidden rounded-lg border-2 border-brand bg-surface">
            <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-brand-tint px-1.5 py-0.5 text-[11px] font-medium text-brand-deep">
              <ICONO_ACCION_SEO.principal aria-hidden="true" className={`${CLASE_TAMANO_ICONO.meta} shrink-0`} strokeWidth={TRAZO_ICONO} />
              {t('seo.imagen.principal')}
            </span>
            <button
              type="button"
              onClick={() => s.cambiar({ imagen: null })}
              aria-label={t('seo.imagen.quitar')}
              className="absolute right-1 top-1 inline-flex size-8 items-center sm:size-6 justify-center rounded-md bg-surface/90 text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ICONO_ACCION_SEO.quitar aria-hidden="true" className={CLASE_TAMANO_ICONO.meta} strokeWidth={TRAZO_ICONO} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element -- imagen del cliente, de cualquier origen */}
            <img src={url} alt="" className="aspect-[1200/630] w-full object-cover" />
            <button
              type="button"
              onClick={() => setSelector(true)}
              className="flex h-8 items-center justify-center gap-1 border-t border-line text-xs text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ICONO_ACCION_SEO.cambiarImagen aria-hidden="true" className={CLASE_TAMANO_ICONO.meta} strokeWidth={TRAZO_ICONO} />
              {t('seo.imagen.cambiar')}
            </button>
          </li>
        ))}
        {imagenes.length < MAX_IMAGENES_COMPARTIR && (
          <li>
            <button
              type="button"
              onClick={() => setSelector(true)}
              className="flex aspect-[132/100] w-[132px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong bg-subtle text-xs text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ICONO_ACCION_SEO.agregar aria-hidden="true" className={CLASE_TAMANO_ICONO.fila} strokeWidth={TRAZO_ICONO} />
              {t('seo.imagen.agregar')}
            </button>
          </li>
        )}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-muted">
          {imagenes.length > 0 ? t('seo.imagen.pie', { n: imagenes.length, max: MAX_IMAGENES_COMPARTIR }) : t('seo.imagen.sinImagen')}
        </p>
        {imagenes.length === 0 && (
          <button type="button" onClick={() => setSelector(true)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            <ICONO_SECCION_SEO.imagen aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
            {t('seo.imagen.agregar')}
          </button>
        )}
      </div>
      {selector && (
        <ImagePickerDialog
          open={selector}
          onOpenChange={setSelector}
          organizationId={organization?.id}
          title={t('seo.imagen.elegir')}
          onSelect={(url) => {
            s.cambiar({ imagen: url });
            setSelector(false);
          }}
        />
      )}
    </div>
  );

  if (sinCabecera) return contenido;
  return (
    <FormSection titulo={t('seo.imagen.seccion')} descripcion={t('seo.imagen.descripcionSeccion')} icono={ICONO_SECCION_SEO.imagen}>
      {contenido}
    </FormSection>
  );
}
