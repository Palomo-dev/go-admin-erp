'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronRight, Download, ImageOff, Images, Loader2, Package, Save } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { EmptyState, FormField, StatusBadge, clasesBoton } from '@/components/kit';
import { useEsEscritorio } from '@/components/kit/useEsEscritorio';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { DetalleImagen } from './ImagenesService';
import { etiquetaFormato, formatoTamano } from './imagenesLogica';

/**
 * Panel lateral de una imagen de la biblioteca (Figma `596:351201`): vista
 * grande, datos («Tamaño», «Subida», «Texto alternativo»), «Usada en N
 * productos» con «Abrir ›» hacia la pestaña Imágenes del producto, y «Asignar a
 * productos» · «Descargar». Con permiso de edición, nombre, texto alternativo
 * y visibilidad se editan aquí mismo («Ver y editar datos»).
 *
 * Escritorio: hoja derecha de 440 px. Móvil: hoja inferior.
 */
export interface PanelDetalleImagenProps {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  detalle: DetalleImagen | null;
  estado: 'cargando' | 'listo' | 'error';
  onReintentar: () => void;
  puedeEditar: boolean;
  onGuardar: (datos: { nombre: string; textoAlternativo: string; publica: boolean }) => Promise<void>;
  onAsignar: () => void;
  onDescargar: () => void;
}

export function PanelDetalleImagen({
  abierto,
  onAbiertoChange,
  detalle,
  estado,
  onReintentar,
  puedeEditar,
  onGuardar,
  onAsignar,
  onDescargar,
}: PanelDetalleImagenProps) {
  const t = useTranslations('inventarioImagenes');
  const locale = useLocale();
  const { formatDate } = useFormatDate();
  const escritorio = useEsEscritorio();
  const [nombre, setNombre] = useState('');
  const [alt, setAlt] = useState('');
  const [publica, setPublica] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorNombre, setErrorNombre] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    if (!detalle) return;
    setNombre(detalle.file_name);
    setAlt(detalle.alt_text ?? '');
    setPublica(detalle.is_public);
    setErrorNombre(null);
    setFallo(false);
  }, [detalle]);

  const cambiado =
    !!detalle && (nombre.trim() !== detalle.file_name || alt.trim() !== (detalle.alt_text ?? '') || publica !== detalle.is_public);

  const guardar = async () => {
    if (!nombre.trim()) {
      setErrorNombre(t('detalle.nombreObligatorio'));
      return;
    }
    setGuardando(true);
    try {
      await onGuardar({ nombre: nombre.trim(), textoAlternativo: alt.trim(), publica });
    } finally {
      setGuardando(false);
    }
  };

  const medidas = detalle?.dimensions ? `${detalle.dimensions.width} × ${detalle.dimensions.height}` : null;
  const tamano = detalle
    ? [formatoTamano(detalle.file_size, locale), medidas, etiquetaFormato(detalle.mime_type, detalle.storage_path)].filter(Boolean).join(' · ')
    : '';

  return (
    <Sheet open={abierto} onOpenChange={onAbiertoChange}>
      <SheetContent
        side={escritorio ? 'right' : 'bottom'}
        className={cn(
          'flex flex-col gap-0 bg-surface p-0',
          escritorio ? 'w-full sm:max-w-[440px]' : 'max-h-[92dvh] rounded-t-2xl',
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 pr-12">
          <div className="min-w-0">
            <SheetTitle className="truncate text-base font-semibold text-fg">{detalle?.file_name ?? t('detalle.titulo')}</SheetTitle>
            <SheetDescription className="sr-only">{t('detalle.descripcion')}</SheetDescription>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          {estado === 'cargando' && !detalle && (
            <div className="flex flex-1 items-center justify-center py-16 text-fg-muted" role="status">
              <Loader2 aria-hidden="true" className="size-6 animate-spin" />
              <span className="sr-only">{t('cargando')}</span>
            </div>
          )}
          {estado === 'error' && (
            <EmptyState variante="error" titulo={t('detalle.error')} onReintentar={onReintentar} compacto />
          )}
          {detalle && estado !== 'error' && (
            <>
              <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl bg-subtle">
                {detalle.url && !fallo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL pública del storage
                  <img src={detalle.url} alt={detalle.alt_text || detalle.file_name} onError={() => setFallo(true)} className="size-full object-contain" />
                ) : fallo ? (
                  <ImageOff aria-hidden="true" className="size-8 text-fg-muted" strokeWidth={1.5} />
                ) : (
                  <Images aria-hidden="true" className="size-8 text-fg-muted" strokeWidth={1.5} />
                )}
              </div>

              <dl className="grid grid-cols-[112px_1fr] gap-x-3 gap-y-2.5 text-sm">
                <dt className="text-fg-secondary">{t('detalle.tamano')}</dt>
                <dd className="text-fg">{tamano}</dd>
                <dt className="text-fg-secondary">{t('detalle.subida')}</dt>
                <dd className="text-fg">
                  {[detalle.created_at ? formatDate(detalle.created_at) : null, detalle.autor].filter(Boolean).join(' · ') || '—'}
                </dd>
                {!puedeEditar && (
                  <>
                    <dt className="text-fg-secondary">{t('detalle.alt')}</dt>
                    <dd className="text-fg">{detalle.alt_text || <span className="text-fg-muted">{t('detalle.sinAlt')}</span>}</dd>
                    <dt className="text-fg-secondary">{t('detalle.visibilidad')}</dt>
                    <dd>
                      <StatusBadge
                        estado={detalle.is_public ? t('insignias.publica') : t('insignias.privada')}
                        tono={detalle.is_public ? 'informacion' : 'neutro'}
                        tamano="sm"
                      />
                    </dd>
                  </>
                )}
              </dl>

              {puedeEditar && (
                <form
                  className="flex flex-col gap-3 rounded-xl border border-line p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void guardar();
                  }}
                >
                  <FormField etiqueta={t('detalle.nombre')} obligatorio error={errorNombre}>
                    <Input
                      value={nombre}
                      maxLength={200}
                      onChange={(e) => {
                        setNombre(e.target.value);
                        setErrorNombre(null);
                      }}
                      className="h-10"
                    />
                  </FormField>
                  <FormField etiqueta={t('detalle.alt')} ayuda={t('detalle.altAyuda')}>
                    <Input value={alt} maxLength={250} onChange={(e) => setAlt(e.target.value)} placeholder={t('detalle.altPlaceholder')} className="h-10" />
                  </FormField>
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="imagen-publica" className="text-sm text-fg">
                      <span className="font-medium">{t('detalle.publica')}</span>
                      <span className="block text-xs text-fg-secondary">{t('detalle.publicaAyuda')}</span>
                    </label>
                    <Switch id="imagen-publica" checked={publica} onCheckedChange={setPublica} />
                  </div>
                  {cambiado && (
                    <button type="submit" disabled={guardando} className={clasesBoton({ variante: 'primario', tamano: 'md', className: 'self-end' })}>
                      {guardando ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Save aria-hidden="true" className="size-4" strokeWidth={1.5} />}
                      {t('detalle.guardar')}
                    </button>
                  )}
                </form>
              )}

              <section aria-labelledby="usada-en" className="flex flex-col gap-2">
                <h3 id="usada-en" className="text-sm font-semibold text-fg">
                  {detalle.productos > 0 ? t('detalle.usadaEn', { n: detalle.productos }) : t('detalle.sinUsar')}
                </h3>
                {detalle.productos === 0 && <p className="text-sm text-fg-secondary">{t('detalle.sinUsarAyuda')}</p>}
                <ul className="flex flex-col gap-2">
                  {detalle.usada_en.map((u) => (
                    <li key={u.product_id}>
                      <Link
                        href={`/app/inventario/productos/${u.product_uuid}?tab=imagenes`}
                        className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand-deep">
                          <Package aria-hidden="true" className="size-4" strokeWidth={1.5} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs text-fg-secondary">
                            {[u.sku, u.principal ? t('detalle.principal') : t('detalle.galeria')].filter(Boolean).join(' · ')}
                          </span>
                          <span className="block truncate text-sm font-medium text-fg">{u.nombre}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-link">
                          {t('detalle.abrir')}
                          <ChevronRight aria-hidden="true" className="size-4" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {detalle.productos > detalle.usada_en.length && (
                  <p className="text-xs text-fg-secondary">{t('detalle.yMas', { n: detalle.productos - detalle.usada_en.length })}</p>
                )}
              </section>
            </>
          )}
        </div>

        {detalle && estado !== 'error' && (
          <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
            {puedeEditar && (
              <button type="button" onClick={onAsignar} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
                <Package aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('acciones.asignar')}
              </button>
            )}
            <button type="button" onClick={onDescargar} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('acciones.descargar')}
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
