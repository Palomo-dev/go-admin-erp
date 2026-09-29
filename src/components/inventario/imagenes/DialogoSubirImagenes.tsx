'use client';

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Camera, Check, ImagePlus, Images, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Dialogo, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { generarImagenIA, ErrorGenerarImagen } from '@/components/inventario/productos/imagenes/subirImagen';
import { ErrorSubida, subirImagen, registrarGenerada } from './ImagenesService';
import { ACEPTAR_BIBLIOTECA, MAX_POR_TANDA, formatoTamano, motivoRechazo, tipoPorExtension } from './imagenesLogica';

/**
 * «Subir imágenes» (Figma `597:353136`): arrastrar y soltar de verdad,
 * «Subir», «Tomar foto» (cámara del móvil) y «Generar con IA» (cuesta
 * créditos: la misma API del formulario de producto). Cada archivo muestra su
 * avance real; los que no sirven se rechazan con el motivo y no se suben.
 * Nada queda huérfano: si el registro falla, el archivo se borra del storage.
 */
type EstadoItem = 'esperando' | 'subiendo' | 'subida' | 'error';

interface Item {
  id: string;
  archivo: File;
  estado: EstadoItem;
  pct: number;
  error?: string;
}

export interface DialogoSubirImagenesProps {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  organizacionId: number;
  nombreOrganizacion: string;
  /** Al cerrar, si se subió algo (para recargar el listado). */
  onSubidas: (n: number) => void;
}

let secuencia = 0;

export function DialogoSubirImagenes({ abierto, onAbiertoChange, organizacionId, nombreOrganizacion, onSubidas }: DialogoSubirImagenesProps) {
  const t = useTranslations('inventarioImagenes.subir');
  const locale = useLocale();
  const [items, setItems] = useState<Item[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [ia, setIa] = useState<{ abierto: boolean; texto: string; generando: boolean; error: string | null }>({
    abierto: false,
    texto: '',
    generando: false,
    error: null,
  });
  const refArchivo = useRef<HTMLInputElement>(null);
  const refCamara = useRef<HTMLInputElement>(null);
  const subidas = useRef(0);
  const cola = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (abierto) {
      setItems([]);
      subidas.current = 0;
      setIa({ abierto: false, texto: '', generando: false, error: null });
    }
  }, [abierto]);

  const actualizar = (id: string, cambio: Partial<Item>) => setItems((l) => l.map((i) => (i.id === id ? { ...i, ...cambio } : i)));

  const mensajeRechazo = useCallback(
    (archivo: File) => {
      const m = motivoRechazo(archivo);
      if (m === 'formato') return t('rechazoFormato', { ext: (archivo.name.split('.').pop() ?? '').toUpperCase() });
      if (m === 'tamano') return t('rechazoTamano');
      return undefined;
    },
    [t],
  );

  const subirUno = useCallback(
    async (item: Item) => {
      actualizar(item.id, { estado: 'subiendo', pct: 0 });
      try {
        await subirImagen(organizacionId, item.archivo, (pct) => actualizar(item.id, { pct }));
        subidas.current += 1;
        actualizar(item.id, { estado: 'subida', pct: 100 });
      } catch (e) {
        const motivo = e instanceof ErrorSubida ? e.motivo : 'subida';
        const clave = motivo === 'formato' ? 'rechazoFormatoCorto' : motivo === 'tamano' ? 'rechazoTamano' : motivo === 'registro' ? 'errorRegistro' : 'errorSubida';
        actualizar(item.id, { estado: 'error', error: t(clave) });
      }
    },
    [organizacionId, t],
  );

  const agregar = useCallback(
    (lista: FileList | File[] | null) => {
      if (!lista) return;
      const nuevos: Item[] = [];
      const pendientes = items.filter((i) => i.estado !== 'error').length;
      for (const archivo of Array.from(lista)) {
        const error = mensajeRechazo(archivo);
        const cupoAgotado = !error && pendientes + nuevos.filter((n) => n.estado !== 'error').length >= MAX_POR_TANDA;
        nuevos.push({
          id: `s${++secuencia}`,
          archivo,
          estado: error || cupoAgotado ? 'error' : 'esperando',
          pct: 0,
          error: error ?? (cupoAgotado ? t('rechazoCupo', { n: MAX_POR_TANDA }) : undefined),
        });
      }
      setItems((l) => [...l, ...nuevos]);
      for (const n of nuevos) {
        if (n.estado === 'esperando') cola.current = cola.current.then(() => subirUno(n));
      }
    },
    [items, mensajeRechazo, subirUno, t],
  );

  const generar = async () => {
    const texto = ia.texto.trim();
    if (!texto) return;
    setIa((s) => ({ ...s, generando: true, error: null }));
    try {
      const r = await generarImagenIA(organizacionId, { nombre: texto });
      if (r.file) {
        agregar([r.file]);
      } else if (r.storage_path && r.storage_path.startsWith(`products/${organizacionId}/`)) {
        const blob = await fetch(r.vista).then((x) => x.blob());
        await registrarGenerada(organizacionId, r.storage_path, `${texto.slice(0, 60)}.png`, blob.size || 1, blob.type || 'image/png');
        subidas.current += 1;
        setItems((l) => [
          ...l,
          { id: `s${++secuencia}`, archivo: new File([blob], `${texto.slice(0, 60)}.png`, { type: blob.type || 'image/png' }), estado: 'subida', pct: 100 },
        ]);
      } else {
        const blob = await fetch(r.vista).then((x) => x.blob());
        agregar([new File([blob], `${texto.slice(0, 60)}.png`, { type: blob.type || tipoPorExtension('x.png') })]);
      }
      setIa({ abierto: false, texto: '', generando: false, error: null });
    } catch (e) {
      const sinCreditos = e instanceof ErrorGenerarImagen && (e.estado === 402 || e.estado === 429);
      setIa((s) => ({ ...s, generando: false, error: sinCreditos ? t('iaSinCreditos') : t('iaError') }));
    }
  };

  const ocupado = items.some((i) => i.estado === 'subiendo' || i.estado === 'esperando') || ia.generando;

  const cerrar = (v: boolean) => {
    if (v) return onAbiertoChange(true);
    if (ocupado) return;
    onAbiertoChange(false);
    if (subidas.current > 0) onSubidas(subidas.current);
  };

  const soltar = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setArrastrando(false);
    agregar(e.dataTransfer.files);
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={cerrar}
      titulo={t('titulo')}
      descripcion={t('descripcion', { organizacion: nombreOrganizacion })}
      ancho={672}
      primario={{
        etiqueta: t('listo'),
        onClick: () => cerrar(false),
        deshabilitada: ocupado,
        motivo: t('esperaSubida'),
      }}
    >
      <div className="flex flex-col gap-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={soltar}
          className={cn(
            'flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors',
            arrastrando ? 'border-brand bg-brand-tint' : 'border-line-strong bg-subtle',
          )}
        >
          <ImagePlus aria-hidden="true" className="size-6 text-brand" strokeWidth={1.5} />
          <p className="text-sm font-medium text-fg">{arrastrando ? t('suelta') : t('arrastra')}</p>
          <p className="text-xs text-fg-muted">{t('reglas', { n: MAX_POR_TANDA })}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => refArchivo.current?.click()} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              <Upload aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('subir')}
            </button>
            <button type="button" onClick={() => refCamara.current?.click()} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              <Camera aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('tomarFoto')}
            </button>
            <button
              type="button"
              aria-expanded={ia.abierto}
              onClick={() => setIa((s) => ({ ...s, abierto: !s.abierto, error: null }))}
              className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
            >
              <Sparkles aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('generarIa')}
            </button>
          </div>
          <input ref={refArchivo} type="file" accept={ACEPTAR_BIBLIOTECA} multiple hidden onChange={(e) => {
            agregar(e.target.files);
            e.target.value = '';
          }} />
          <input ref={refCamara} type="file" accept={ACEPTAR_BIBLIOTECA} capture="environment" hidden onChange={(e) => {
            agregar(e.target.files);
            e.target.value = '';
          }} />
        </div>

        {ia.abierto && (
          <form
            className="flex flex-col gap-2 rounded-xl border border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void generar();
            }}
          >
            <label htmlFor="imagen-ia" className="text-sm font-medium text-fg">
              {t('iaEtiqueta')}
            </label>
            <div className="flex gap-2">
              <Input id="imagen-ia" value={ia.texto} maxLength={200} placeholder={t('iaPlaceholder')} onChange={(e) => setIa((s) => ({ ...s, texto: e.target.value }))} className="h-10" />
              <button type="submit" disabled={ia.generando || !ia.texto.trim()} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
                {ia.generando ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Sparkles aria-hidden="true" className="size-4" strokeWidth={1.5} />}
                {t('iaGenerar')}
              </button>
            </div>
            <p className={cn('text-xs', ia.error ? 'text-danger-text' : 'text-fg-secondary')} role={ia.error ? 'alert' : undefined}>
              {ia.error ?? t('iaCosto')}
            </p>
          </form>
        )}

        {items.length > 0 && (
          <ul className="flex flex-col gap-3" aria-live="polite">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-3">
                <Images aria-hidden="true" className="size-6 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{i.archivo.name}</p>
                  {i.estado === 'error' ? (
                    <p className="text-xs text-danger-text">{i.error}</p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2 text-xs text-fg-secondary">
                        <span>
                          {formatoTamano(i.archivo.size, locale)} · {t(`estados.${i.estado}`)}
                        </span>
                        <span className="tabular-nums">{i.pct} %</span>
                      </div>
                      <div
                        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-subtle"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={i.pct}
                        aria-label={i.archivo.name}
                      >
                        <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${i.pct}%` }} />
                      </div>
                    </>
                  )}
                </div>
                {i.estado === 'subida' ? (
                  <Check aria-label={t('estados.subida')} className="size-5 shrink-0 text-success-text" />
                ) : i.estado === 'error' ? (
                  <button
                    type="button"
                    onClick={() => setItems((l) => l.filter((x) => x.id !== i.id))}
                    aria-label={t('quitar', { nombre: i.archivo.name })}
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                ) : (
                  <Loader2 aria-hidden="true" className="size-5 shrink-0 animate-spin text-fg-muted" />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialogo>
  );
}
