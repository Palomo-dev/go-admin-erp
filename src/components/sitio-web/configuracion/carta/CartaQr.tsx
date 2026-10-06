'use client';

/**
 * «Carta QR» (Figma B/13-03): un código por mesa o por zona de la sede, con el
 * modo al escanear (ver la carta y pedir a la mesa, o solo ver la carta), la
 * hoja de impresión A6 (4 por hoja) y el PDF. Las mesas salen de POS › Mesas
 * (`restaurant_tables`); la URL del QR la arma el servidor con el host público
 * del sitio (`urlQrMesa`, el contrato que lee goadmin-websites).
 */
import { useMemo, useState } from 'react';
import { Copy, Download, Printer, RefreshCw } from 'lucide-react';
import { EmptyState, FormField, SegmentedControl, clasesBoton, type AccionFila } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { contarZonas, elementosQr, type QrModo, type QrPor } from '@/lib/website/carta';
import { MarcoSitioWeb } from '../../MarcoSitioWeb';
import { QRCard } from '../../ui/QRCard';
import { RUTA_API_CARTA } from '../api';
import { enlacesConfiguracion } from '../enlaces';
import { useTextosConfiguracion } from '../textos';
import { RUTA_CARTA, RUTA_CARTA_QR } from './rutasCarta';
import { useMesasQr } from './useCarta';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../../ui/iconosSitio';

function EsqueletoQr() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-52 rounded-xl" />
      ))}
    </div>
  );
}

export function urlPdfQr(opciones: { sedeId: number | null; por: QrPor; modo: QrModo; clave?: string }): string {
  const q = new URLSearchParams({ por: opciones.por, modo: opciones.modo });
  if (opciones.sedeId) q.set('branch_id', String(opciones.sedeId));
  if (opciones.clave) q.set('clave', opciones.clave);
  return `${RUTA_API_CARTA}/qr.pdf?${q.toString()}`;
}

export function CartaQr() {
  const t = useTextosConfiguracion();
  const { toast } = useToast();
  const [sedeId, setSedeId] = useState<number | null>(null);
  const [por, setPor] = useState<QrPor>('mesa');
  const [modo, setModo] = useState<QrModo>('pedir');
  const q = useMesasQr(sedeId);
  const d = q.datos;
  const sede = d?.sedes.find((s) => s.id === d.sedeId) ?? null;
  const elementos = useMemo(
    () => (d ? elementosQr(d.mesas, { por, modo, urlGeneral: d.urlGeneral, sede: sede?.nombre ?? '', sinZona: t('qr.sinZona') }) : []),
    [d, por, modo, sede, t],
  );
  const ejemplo = elementos[0] ?? null;
  const pdf = urlPdfQr({ sedeId: d?.sedeId ?? null, por, modo });

  const copiar = async () => {
    if (!d?.urlGeneral) return;
    try {
      await navigator.clipboard.writeText(d.urlGeneral);
      toast({ title: t('qr.copiado') });
    } catch {
      toast({ title: d.urlGeneral });
    }
  };

  const subtitulo = d && sede
    ? d.mesas.length > 0
      ? t('qr.subtitulo', { sede: sede.nombre, mesas: d.mesas.length, zonas: contarZonas(d.mesas) })
      : t('qr.subtituloSinMesas', { sede: sede.nombre })
    : undefined;

  const menu: AccionFila[] = [
    { id: 'recargar', etiqueta: t('carta.recargar'), icono: RefreshCw, onSelect: () => void q.recargar() },
    { id: 'copiar', etiqueta: t('qr.copiarGeneral'), icono: Copy, onSelect: () => void copiar(), deshabilitada: !d?.urlGeneral },
  ];

  const contenido = () => {
    if (q.fallo === 'sin_permiso') return <EmptyState variante="forbidden" titulo={t('carta.sinPermisoTitulo')} descripcion={t('carta.sinPermisoDescripcion')} />;
    if (q.fallo) return <EmptyState variante="error" titulo={t('carta.errorTitulo')} descripcion={t('carta.errorDescripcion')} onReintentar={() => void q.recargar()} />;
    if (!d) return null;
    const mesas = enlacesConfiguracion.mesas();
    const dominios = enlacesConfiguracion.dominios();

    return (
      <div className="flex flex-col gap-4 lg:gap-6">
        <div className="flex flex-wrap items-end gap-4">
          <FormField etiqueta={t('qr.sede')} className="w-full sm:w-56">
            {(campo) => (
              <Select value={d.sedeId ? String(d.sedeId) : ''} onValueChange={(v) => setSedeId(Number(v))}>
                <SelectTrigger className="h-10 rounded-lg" aria-labelledby={campo.idEtiqueta}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {d.sedes.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('qr.unQrPor')}>
            {(campo) => (
              <SegmentedControl
                aria-labelledby={campo.idEtiqueta}
                opciones={[
                  { valor: 'mesa', etiqueta: t('qr.mesa') },
                  { valor: 'zona', etiqueta: t('qr.zona') },
                ]}
                valor={por}
                onValorChange={setPor}
              />
            )}
          </FormField>
          <FormField etiqueta={t('qr.alEscanear')} className="w-full sm:w-72">
            {(campo) => (
              <Select value={modo} onValueChange={(v) => setModo(v as QrModo)} disabled={por === 'zona'}>
                <SelectTrigger className="h-10 rounded-lg" aria-labelledby={campo.idEtiqueta}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pedir">{t('qr.pedir')}</SelectItem>
                  <SelectItem value="ver">{t('qr.ver')}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
        </div>
        {por === 'zona' && <p className="text-xs text-fg-muted">{t('qr.zonaNota')}</p>}

        {!d.host ? (
          <EmptyState
            variante="empty"
            titulo={t('qr.sinSitioTitulo')}
            descripcion={t('qr.sinSitioDescripcion')}
            accion={dominios ? { etiqueta: t('qr.irDominios'), href: dominios } : undefined}
          />
        ) : d.mesas.length === 0 ? (
          <EmptyState
            variante="empty"
            titulo={t('qr.sinMesasTitulo')}
            descripcion={t('qr.sinMesasDescripcion')}
            accion={mesas ? { etiqueta: t('qr.irMesas'), href: mesas } : undefined}
          />
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {elementos.map((e) => (
                <li key={e.clave} className="flex justify-center">
                  <QRCard url={e.url} titulo={e.titulo} detalle={e.detalle} className="w-full" />
                </li>
              ))}
            </ul>
            {ejemplo && (
              <section aria-label={t('qr.asiImprime')} className="flex flex-col items-start gap-6 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:p-6">
                <QRCard
                  url={ejemplo.url}
                  titulo={ejemplo.titulo}
                  detalle={ejemplo.detalle}
                  tamano="lg"
                  llamada={por === 'mesa' && modo === 'pedir' ? t('qr.escanea') : t('qr.escaneaVer')}
                />
                <div className="flex min-w-0 flex-col gap-2">
                  <h2 className="text-base font-semibold text-fg">{t('qr.asiImprime')}</h2>
                  <p className="text-[13px] text-fg-secondary">{t('qr.asiImprimeDescripcion')}</p>
                  <a href={pdf} className={clasesBoton({ variante: 'primario', tamano: 'md', className: 'self-start' })}>
                    <Download aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                    {t('qr.descargarN', { n: elementos.length })}
                  </a>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    );
  };

  const puedeDescargar = !!d && !!d.host && elementos.length > 0;

  return (
    <MarcoSitioWeb
      href={RUTA_CARTA_QR}
      titulo={t('qr.titulo')}
      migasPadre={[{ etiqueta: t('carta.titulo'), href: RUTA_CARTA }]}
      subtitulo={subtitulo}
      estado={q.cargando && !d ? 'cargando' : 'listo'}
      esqueleto={<EsqueletoQr />}
      nombreContenido={t('qr.nombreContenido')}
      sinVerSitio
      menu={menu}
      acciones={q.fallo ? <></> : undefined}
      accionesSecundarias={
        <>
          <button
            type="button"
            className={clasesBoton({ variante: 'secundario', tamano: 'md', className: 'px-3' })}
            aria-label={t('carta.recargar')}
            title={t('carta.recargar')}
            onClick={() => void q.recargar()}
          >
            <RefreshCw aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          </button>
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'md' })} disabled={!d?.urlGeneral} onClick={() => void copiar()}>
            <Copy aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
            {t('qr.copiarGeneral')}
          </button>
        </>
      }
      accionPrimaria={
        puedeDescargar ? (
          <a href={pdf} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
            <Printer aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
            {t('qr.descargar')}
          </a>
        ) : (
          <button type="button" disabled className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
            <Printer aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
            {t('qr.descargar')}
          </button>
        )
      }
    >
      {contenido()}
    </MarcoSitioWeb>
  );
}
