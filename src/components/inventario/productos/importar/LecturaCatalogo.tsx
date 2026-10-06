'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, KeyRound, Loader2, ScanSearch, Square, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { FormField, KpiCompacto } from '@/components/kit';
import type { AsistenteImportacion } from './useAsistenteImportacion';
import { useLecturaCatalogo } from './useLecturaCatalogo';

interface Props {
  a: AsistenteImportacion;
  orgId: number | undefined;
  url: string;
  /** Mientras la IA analiza la página, no se lee el catálogo (y al revés). */
  ocupado: boolean;
  onOcupado: (ocupado: boolean) => void;
  onError: (mensaje: string) => void;
  onInfo: (mensaje: string) => void;
}

/**
 * Catálogo completo de la tienda por su API pública (Shopify, WooCommerce,
 * VTEX, Magento, PrestaShop con clave) o por sitemap + JSON-LD (Tiendanube,
 * Wix, Squarespace, BigCommerce, Jumpseller…): pegar URL → detectar → leer por
 * tandas con progreso → selección. Sin IA y sin créditos.
 */
export function LecturaCatalogo({ a, orgId, url, ocupado, onOcupado, onError, onInfo }: Props) {
  const t = useTranslations('productosImportar.catalogo');
  const l = useLecturaCatalogo(orgId);
  const [clave, setClave] = useState('');
  const { estado } = l;
  const d = estado.deteccion;
  const detectando = estado.fase === 'detectando';
  const leyendo = estado.fase === 'leyendo';
  const nombre = (p?: string | null) => (p ? t(`plataformas.${p}`) : t('plataformas.generica'));

  const detectar = async (conClave?: string) => {
    const limpia = url.trim();
    if (!/^https?:\/\/\S+\.\S+/.test(limpia)) return onError(t('urlInvalida'));
    onOcupado(true);
    try {
      const r = await l.detectar(limpia, conClave);
      if (!r) return;
      if (conClave && r.plataforma !== 'prestashop') onError(t('claveRechazada'));
    } finally {
      onOcupado(false);
    }
  };

  const leer = async () => {
    if (!d) return;
    onOcupado(true);
    try {
      const { productos, completo } = await l.leer(d, d.plataforma === 'prestashop' ? clave : undefined);
      if (productos.length === 0) return onError(t('sinProductos'));
      a.cargarWeb(url.trim(), productos, 0, false, d.detectada ?? d.plataforma);
      onInfo(completo ? t('leidoCompleto', { n: productos.length }) : t('leidoParcial', { n: productos.length }));
      a.setPaso('seleccion');
    } finally {
      onOcupado(false);
    }
  };

  const pct = estado.total ? Math.min(100, Math.round((estado.recorridos / estado.total) * 100)) : undefined;

  return (
    <div className="flex flex-col gap-3">
      {!d && (
        <Button onClick={() => void detectar()} disabled={!url.trim() || ocupado} className="w-full sm:w-auto sm:self-start">
          {detectando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ScanSearch className="size-4" aria-hidden="true" />}
          {detectando ? t('detectando') : t('detectar')}
        </Button>
      )}

      {estado.fase === 'error' && !d && (
        <p className="flex items-center gap-1.5 text-sm text-danger-text" role="alert">
          <AlertTriangle className="size-4" aria-hidden="true" /> {t('errorDeteccion', { mensaje: estado.error ?? '' })}
        </p>
      )}

      {d && (
        <section aria-labelledby="catalogo-detectado" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Store className="size-5 text-brand" aria-hidden="true" />
            <h3 id="catalogo-detectado" className="text-sm font-semibold text-fg">
              {d.disponible ? t('detectada', { plataforma: nombre(d.detectada ?? d.plataforma) }) : t('noDisponible', { plataforma: nombre(d.detectada) })}
            </h3>
            {d.disponible && (
              <Badge tono="exito" tamano="sm">
                {t('sinCosto')}
              </Badge>
            )}
            {d.disponible && d.plataforma === 'generica' && (
              <Badge tono="informacion" tamano="sm">
                {t('modoSitemap')}
              </Badge>
            )}
          </div>

          {d.disponible && (
            <KpiCompacto
              etiqueta={t('resumen')}
              cifras={[
                { id: 'productos', etiqueta: d.plataforma === 'generica' ? t('cifras.fichas') : t('cifras.productos'), valor: d.total !== undefined ? d.total.toLocaleString() : t('cifras.alLeer') },
                ...(d.categorias !== undefined ? [{ id: 'categorias', etiqueta: d.plataforma === 'shopify' ? t('cifras.colecciones') : t('cifras.categorias'), valor: d.categorias.toLocaleString() }] : []),
                { id: 'leidos', etiqueta: t('cifras.leidos'), valor: estado.leidos.toLocaleString(), tono: estado.leidos > 0 ? 'exito' : undefined },
              ]}
            />
          )}

          {estado.avisos.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-fg-secondary">
              {estado.avisos.map((c) => (
                <li key={c}>{t.has(`avisos.${c}`) ? t(`avisos.${c}`) : c}</li>
              ))}
            </ul>
          )}

          {!d.disponible && <p className="text-sm text-fg-secondary">{t('usarIa')}</p>}

          {(d.requiereClave || d.plataforma === 'prestashop') && (
            <FormField etiqueta={t('clave.etiqueta')} ayuda={t('clave.ayuda')}>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <KeyRound aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
                  <Input type="password" autoComplete="off" spellCheck={false} value={clave} onChange={(e) => setClave(e.target.value.trim())} className="pl-9" disabled={leyendo || detectando} />
                </div>
                {d.plataforma !== 'prestashop' && (
                  <Button variant="outline" onClick={() => void detectar(clave)} disabled={!clave || ocupado}>
                    {t('clave.usar')}
                  </Button>
                )}
              </div>
            </FormField>
          )}

          {leyendo && (
            <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
              <Progress value={pct ?? 0} className="h-2" aria-label={t('leyendo')} />
              <p className="text-xs text-fg-secondary">
                {d.plataforma === 'generica'
                  ? t('progresoFichas', { recorridas: estado.recorridos, total: estado.total ?? 0, leidos: estado.leidos, sinDatos: estado.sinDatos })
                  : t('progreso', { leidos: estado.leidos, total: estado.total ?? 0, tandas: estado.tandas })}
              </p>
            </div>
          )}

          {(estado.fase === 'error' || estado.fase === 'detenida') && estado.leidos === 0 && estado.error && (
            <p className="flex items-center gap-1.5 text-xs text-danger-text" role="alert">
              <AlertTriangle className="size-3.5" aria-hidden="true" /> {estado.error}
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            {leyendo ? (
              <Button variant="outline" onClick={l.detener}>
                <Square className="size-4" aria-hidden="true" /> {t('detener')}
              </Button>
            ) : (
              <>
                {d.disponible && (
                  <Button onClick={() => void leer()} disabled={ocupado || (d.plataforma === 'prestashop' && !clave)}>
                    <Store className="size-4" aria-hidden="true" /> {t('leer')}
                  </Button>
                )}
                <Button variant="ghost" onClick={l.reiniciar} disabled={ocupado}>
                  {t('otraUrl')}
                </Button>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
