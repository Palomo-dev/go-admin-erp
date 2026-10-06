'use client';

/**
 * «SEO de la página» desde el «⋯» del editor (o con `?panel=seo`, desde SEO y redes ›
 * «Corregir»): título y descripción para buscadores con contador, e imagen para compartir.
 * Los cambios van a la página en edición (borrador en V2; «Guardar y publicar» en legacy).
 */
import { useEffect, useState } from 'react';
import { Dialogo, FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useTextosEditor } from './textos';

const MAX_TITULO = 60;
const MAX_DESCRIPCION = 160;

export interface DialogoSeoPaginaProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  pagina: string;
  valores: { meta_title: string; meta_description: string; og_image_url: string };
  onGuardar: (v: { meta_title: string; meta_description: string; og_image_url: string }) => void;
}

export function DialogoSeoPagina(p: DialogoSeoPaginaProps) {
  const t = useTextosEditor();
  const [v, setV] = useState(p.valores);
  useEffect(() => {
    if (p.abierto) setV(p.valores);
    // Solo al abrir: lo escrito no se pisa con cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.abierto]);
  const contador = (n: number, max: number) => (
    <span className={n > max ? 'text-xs font-medium tabular-nums text-warning-text' : 'text-xs tabular-nums text-fg-secondary'}>
      {n}/{max}
    </span>
  );
  return (
    <Dialogo
      abierto={p.abierto}
      onAbiertoChange={p.onAbiertoChange}
      titulo={t('seo.titulo', { pagina: p.pagina })}
      descripcion={t('seo.descripcion')}
      ancho={520}
      primario={{
        etiqueta: t('seo.aplicar'),
        onClick: () => {
          p.onGuardar(v);
          p.onAbiertoChange(false);
        },
      }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('seo.metaTitulo')} extra={contador(v.meta_title.length, MAX_TITULO)} ayuda={t('seo.metaTituloAyuda')}>
          <Input value={v.meta_title} onChange={(e) => setV({ ...v, meta_title: e.target.value })} className="h-10 rounded-lg" />
        </FormField>
        <FormField etiqueta={t('seo.metaDescripcion')} extra={contador(v.meta_description.length, MAX_DESCRIPCION)}>
          <Textarea rows={3} value={v.meta_description} onChange={(e) => setV({ ...v, meta_description: e.target.value })} className="rounded-lg" />
        </FormField>
        <FormField etiqueta={t('seo.imagen')} ayuda={t('seo.imagenAyuda')}>
          <Input type="url" value={v.og_image_url} onChange={(e) => setV({ ...v, og_image_url: e.target.value })} placeholder="https://" className="h-10 rounded-lg" />
        </FormField>
      </div>
    </Dialogo>
  );
}
