'use client';

/**
 * Subida de UNA imagen para el chat del sitio web (Figma «SubidaImagenUnica»,
 * diseños 94-chat-recuperado-canales 14 a 17, 19, 21, 23 y 24): logo de la
 * cabecera e «Imagen propia» del botón. Arrastrar o elegir el archivo, con
 * avance y «Cancelar», errores de formato y de tamaño, la lista con miniatura,
 * «Cambiar» y «Quitar», y el enlace https como alternativa.
 *
 * Sube con la lógica de `ImageUploader` (`@/components/common/subidaImagen`),
 * al bucket `logos`, bajo `<organización>/chat-widget/<canal>/`. Al quitar o
 * cambiar se borra el archivo anterior SOLO si lo subió el widget de esta
 * organización (`rutaPropiaDelWidget`): nunca el logo de la organización ni un
 * enlace externo. El borrado es lo último y no bloquea: si falla (RLS solo deja
 * borrar al que lo subió), la imagen ya quedó cambiada.
 */
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, ImagePlus, Link2, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react';
import { clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils/Utils';
import { SubidaCancelada, borrarImagenes, nombreSeguro, rutaEnBucket, subirImagen, validarImagen } from '@/components/common/subidaImagen';
import {
  BUCKET_WIDGET,
  MAX_MB_IMAGEN_WIDGET,
  TIPOS_IMAGEN_WIDGET,
  esUrlImagenValida,
  formatoDeImagen,
  nombreDeArchivoWidget,
  rutaPropiaDelWidget,
  tamanoArchivo,
  type ClaseImagenWidget,
} from './widgetLogica';

export interface SubidaImagenUnicaProps {
  /** URL guardada ('' = sin imagen). */
  valor: string;
  /** Guarda la URL nueva ('' = quitar). Lanza si no se pudo guardar. */
  onGuardar: (url: string) => Promise<void>;
  clase: ClaseImagenWidget;
  /** `<organización>/chat-widget/<canal>`; sin ella no se puede subir (solo enlace). */
  carpeta: string | null;
  organizacionId: number | string | null | undefined;
  /** Id del campo de enlace (lo enlaza la etiqueta del FormField). */
  idCampo?: string;
  /** «· se recorta en círculo» en la línea de datos del archivo. */
  recorteCirculo?: boolean;
  /** Miniatura cuando no hay imagen en modo enlace (iniciales del chat). */
  marcador?: string;
  /** Ayuda bajo el campo cuando se sube archivo (en modo enlace va la del enlace). */
  ayuda?: string;
}

type Estado =
  | { tipo: 'reposo' }
  | { tipo: 'subiendo'; nombre: string; total: number; fraccion: number }
  | { tipo: 'error'; nombre: string; motivo: 'formato' | 'tamano' | 'red'; mb?: number };

interface Meta {
  bytes?: number;
  ancho?: number;
  alto?: number;
  nombre?: string;
  formato?: string;
}

export function SubidaImagenUnica({ valor, onGuardar, clase, carpeta, organizacionId, idCampo, recorteCirculo, marcador, ayuda }: SubidaImagenUnicaProps) {
  const t = useTranslations('chatModulo.canales.widget.subida');
  const locale = useLocale();
  const entrada = useRef<HTMLInputElement>(null);
  const cancelar = useRef<AbortController | null>(null);
  const idAyuda = useId();
  const [estado, setEstado] = useState<Estado>({ tipo: 'reposo' });
  const [arrastrando, setArrastrando] = useState(false);
  const [meta, setMeta] = useState<Meta>({});
  const [enlace, setEnlace] = useState(valor);
  const propia = rutaPropiaDelWidget(valor, organizacionId, rutaEnBucket);
  // Enlace externo guardado, o la persona eligió «o pega un enlace».
  const [modoEnlace, setModoEnlace] = useState(!!valor && !propia);
  useEffect(() => {
    setEnlace(valor);
    if (valor && !rutaPropiaDelWidget(valor, organizacionId, rutaEnBucket)) setModoEnlace(true);
  }, [valor, organizacionId]);

  // Datos del archivo guardado: nombre por la ruta; peso con HEAD (bucket público).
  useEffect(() => {
    if (!propia) return;
    let vivo = true;
    setMeta((m) => ({ ...m, nombre: nombreDeArchivoWidget(propia), formato: m.formato ?? formatoDeImagen(propia) }));
    if (meta.bytes === undefined && typeof fetch === 'function') {
      fetch(valor, { method: 'HEAD' })
        .then((r) => {
          const n = Number(r.headers.get('content-length'));
          if (vivo && n > 0) setMeta((m) => ({ ...m, bytes: n }));
        })
        .catch(() => undefined);
    }
    return () => {
      vivo = false;
    };
  }, [propia]); // eslint-disable-line react-hooks/exhaustive-deps

  const borrarAnterior = (anterior: string) => {
    const ruta = rutaPropiaDelWidget(anterior, organizacionId, rutaEnBucket);
    if (ruta) void borrarImagenes(BUCKET_WIDGET, [ruta]).then(({ error }) => error && console.warn('No se borró la imagen anterior del widget:', error.message));
  };

  const subir = async (archivo: File) => {
    const error = validarImagen(archivo, TIPOS_IMAGEN_WIDGET, MAX_MB_IMAGEN_WIDGET);
    if (error) {
      setEstado({ tipo: 'error', nombre: archivo.name, motivo: error.tipo, mb: error.tipo === 'tamano' ? error.mb : undefined });
      return;
    }
    if (!carpeta) return;
    const control = new AbortController();
    cancelar.current = control;
    setEstado({ tipo: 'subiendo', nombre: archivo.name, total: archivo.size, fraccion: 0 });
    const ruta = `${carpeta}/${clase}-${Date.now()}-${nombreSeguro(archivo.name)}`;
    const anterior = valor;
    let url: string | null = null;
    try {
      url = await subirImagen({
        bucket: BUCKET_WIDGET,
        ruta,
        archivo,
        signal: control.signal,
        onProgreso: (fraccion) => setEstado((e) => (e.tipo === 'subiendo' ? { ...e, fraccion } : e)),
      });
      await onGuardar(url);
      setMeta({ bytes: archivo.size, nombre: archivo.name, formato: formatoDeImagen(archivo.type) });
      setModoEnlace(false);
      setEstado({ tipo: 'reposo' });
      if (anterior !== url) borrarAnterior(anterior);
    } catch (e) {
      if (url) void borrarImagenes(BUCKET_WIDGET, [ruta]); // subió pero no se guardó: no deja huérfanos
      if (e instanceof SubidaCancelada) setEstado({ tipo: 'reposo' });
      else {
        console.error('Error subiendo la imagen del widget:', e);
        setEstado({ tipo: 'error', nombre: archivo.name, motivo: 'red' });
      }
    } finally {
      cancelar.current = null;
      if (entrada.current) entrada.current.value = '';
    }
  };

  const quitar = async () => {
    const anterior = valor;
    try {
      await onGuardar('');
      setMeta({});
      borrarAnterior(anterior);
    } catch {
      /* la página avisó con un toast */
    }
  };

  const guardarEnlace = () => {
    const v = enlace.trim();
    if (!esUrlImagenValida(v) || v === valor) return;
    const anterior = valor;
    onGuardar(v)
      .then(() => borrarAnterior(anterior))
      .catch(() => undefined);
  };

  const elegir = () => entrada.current?.click();
  const soltar = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setArrastrando(false);
    const archivo = e.dataTransfer.files?.[0];
    if (archivo) void subir(archivo);
  };
  const propsArrastre = {
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (carpeta && estado.tipo !== 'subiendo') setArrastrando(true);
    },
    onDragLeave: (e: DragEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastrando(false);
    },
    onDrop: soltar,
  };

  const reglas = t('reglas', { mb: MAX_MB_IMAGEN_WIDGET });
  const enEnlace = modoEnlace || !carpeta;
  const urlInvalida = enEnlace && !esUrlImagenValida(enlace);
  const entradaArchivo = (
    <input
      ref={entrada}
      type="file"
      accept={TIPOS_IMAGEN_WIDGET.join(',')}
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        const archivo = e.target.files?.[0];
        if (archivo) void subir(archivo);
      }}
    />
  );

  const miniatura = (src: string | null, tono: 'imagen' | 'subiendo' = 'imagen') => (
    <span
      className={cn(
        'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full',
        tono === 'subiendo' ? 'bg-warning-subtle text-warning-text' : 'border border-line bg-subtle text-fg-muted',
      )}
    >
      {tono === 'subiendo' ? (
        <Loader2 aria-hidden="true" className="size-5 animate-spin" strokeWidth={1.75} />
      ) : src ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagen subida o enlazada por la organización
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          onLoad={(e) => {
            const img = e.currentTarget;
            setMeta((m) => ({ ...m, ancho: img.naturalWidth || undefined, alto: img.naturalHeight || undefined }));
          }}
        />
      ) : (
        <span className="text-xs font-semibold text-fg-secondary">{marcador}</span>
      )}
    </span>
  );

  const enlaceAlterno = enEnlace ? (
    carpeta && (
      <button type="button" onClick={() => setModoEnlace(false)} className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
        <Upload aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
        {t('subeArchivo')}
      </button>
    )
  ) : (
    <button type="button" onClick={() => setModoEnlace(true)} className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
      <Link2 aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
      {t('pegaEnlace')}
    </button>
  );

  let cuerpo;
  if (estado.tipo === 'subiendo') {
    const pct = Math.round(estado.fraccion * 100);
    cuerpo = (
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
        {miniatura(null, 'subiendo')}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="truncate text-sm font-medium text-fg">{estado.nombre}</p>
          <div
            role="progressbar"
            aria-label={t('subiendoEtiqueta', { nombre: estado.nombre })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-1 w-full overflow-hidden rounded-full bg-line"
          >
            <div className="h-full rounded-full bg-brand-action transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-fg-muted">
            {t('subiendo', { pct, subido: tamanoArchivo(estado.total * estado.fraccion, locale), total: tamanoArchivo(estado.total, locale) })}
          </p>
        </div>
        <button type="button" onClick={() => cancelar.current?.abort()} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
          {t('cancelar')}
        </button>
      </div>
    );
  } else if (estado.tipo === 'error') {
    const detalle =
      estado.motivo === 'formato'
        ? t('errorFormato', { nombre: estado.nombre, mb: MAX_MB_IMAGEN_WIDGET })
        : estado.motivo === 'tamano'
          ? t('errorTamano', { nombre: estado.nombre, pesa: (estado.mb ?? 0).toLocaleString(locale, { maximumFractionDigits: 1 }), mb: MAX_MB_IMAGEN_WIDGET })
          : t('errorRed', { nombre: estado.nombre });
    cuerpo = (
      <div
        {...propsArrastre}
        role="alert"
        className={cn(
          'flex flex-col gap-3 rounded-xl border border-dashed p-4 sm:flex-row sm:items-center',
          arrastrando ? 'border-brand bg-brand-tint' : 'border-line-danger bg-danger-subtle',
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-subtle text-danger-text">
            <AlertCircle aria-hidden="true" className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-danger-text">{t('errorTitulo')}</p>
            <p className="text-xs leading-4 text-fg-secondary">{detalle}</p>
          </div>
        </div>
        {carpeta && (
          <button type="button" onClick={elegir} className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'self-start sm:self-center' })}>
            <Upload aria-hidden="true" className="size-4" strokeWidth={1.75} />
            {t('elegirOtra')}
          </button>
        )}
      </div>
    );
  } else if (enEnlace) {
    cuerpo = (
      <div className="flex items-center gap-2">
        {miniatura(valor && esUrlImagenValida(valor) ? valor : null)}
        <Input
          id={idCampo}
          value={enlace}
          placeholder="https://…"
          inputMode="url"
          aria-invalid={urlInvalida || undefined}
          aria-describedby={idAyuda}
          onChange={(e) => setEnlace(e.target.value)}
          onBlur={guardarEnlace}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), guardarEnlace())}
        />
      </div>
    );
  } else if (valor) {
    const datos = [
      meta.formato ?? formatoDeImagen(valor),
      meta.ancho && meta.alto ? t('dimensiones', { ancho: meta.ancho, alto: meta.alto }) : null,
      meta.bytes ? tamanoArchivo(meta.bytes, locale) : null,
      recorteCirculo ? t('recorteCirculo') : null,
    ].filter(Boolean);
    cuerpo = (
      <div {...propsArrastre} className={cn('flex flex-col gap-3 rounded-xl border bg-surface p-4 sm:flex-row sm:items-center', arrastrando ? 'border-dashed border-brand bg-brand-tint' : 'border-line')}>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {miniatura(valor)}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{meta.nombre ?? (propia ? nombreDeArchivoWidget(propia) : '')}</p>
            <p className="truncate text-xs text-fg-muted">{datos.join(' · ')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={elegir} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.75} />
            {t('cambiar')}
          </button>
          <button type="button" onClick={quitar} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
            <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
            {t('quitar')}
          </button>
        </div>
      </div>
    );
  } else {
    cuerpo = (
      <div
        {...propsArrastre}
        className={cn(
          'flex flex-col gap-3 rounded-xl border border-dashed p-4 sm:flex-row sm:items-center',
          arrastrando ? 'border-brand bg-brand-tint' : 'border-line-strong bg-subtle',
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', arrastrando ? 'bg-surface text-brand' : 'bg-brand-tint text-brand')}>
            {arrastrando ? <Upload aria-hidden="true" className="size-5" strokeWidth={1.75} /> : <ImagePlus aria-hidden="true" className="size-5" strokeWidth={1.75} />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg">
              {arrastrando ? t('suelta') : <><span className="hidden sm:inline">{t('arrastra')}</span><span className="sm:hidden">{t('toca')}</span></>}
            </p>
            <p className="text-xs leading-4 text-fg-muted">{reglas}</p>
          </div>
        </div>
        {!arrastrando && (
          <button type="button" onClick={elegir} className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'self-start sm:self-center' })}>
            <Upload aria-hidden="true" className="size-4" strokeWidth={1.75} />
            {t('subir')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {entradaArchivo}
      {cuerpo}
      {enEnlace && estado.tipo === 'reposo' && (
        <p id={idAyuda} className={cn('text-xs', urlInvalida ? 'text-danger-text' : 'text-fg-muted')}>
          {urlInvalida ? t('enlaceInvalido') : t(clase === 'logo' ? 'enlaceAyudaLogo' : 'enlaceAyudaIcono')}
        </p>
      )}
      {estado.tipo !== 'subiendo' && enlaceAlterno}
      {ayuda && !enEnlace && <p className="text-xs text-fg-muted">{ayuda}</p>}
    </div>
  );
}
