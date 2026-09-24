'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Eye,
  GripVertical,
  ImageOff,
  ImagePlus,
  Images,
  Loader2,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ACEPTAR_IMAGENES } from './subirImagen';

/**
 * Galería editable de imágenes de producto (Figma `Producto — Imágenes` y el
 * bloque «Imágenes» de `Nuevo producto`). La usan el detalle (escribe al
 * momento) y el formulario (solo cambia su estado). Acciones SIEMPRE visibles
 * (A.15 #12): ver, principal, mover antes/después (y arrastrar en
 * escritorio), texto alternativo y eliminar/quitar. Si la URL falla se ve
 * «Sin imagen».
 */
export interface ItemGaleria {
  clave: string;
  url: string;
  alt: string;
  principal: boolean;
  /** Marca pequeña («IA», «Biblioteca», «Nueva»). */
  insignia?: string;
}

export interface GaleriaEditableProps {
  items: readonly ItemGaleria[];
  onVer: (indice: number) => void;
  onPrincipal: (clave: string) => void;
  onAlt: (clave: string, texto: string) => void;
  onMover: (clave: string, delta: -1 | 1) => void;
  onReordenar: (desde: number, hasta: number) => void;
  onQuitar: (clave: string) => void;
  /** `alSalir`: el texto alternativo se entrega al perder el foco (detalle); `inmediato`: en cada tecla (formulario). */
  modoAlt?: 'alSalir' | 'inmediato';
  /** «Eliminar» (detalle, borra) o «Quitar» (formulario, aún no se guardó). */
  verboQuitar?: 'eliminar' | 'quitar';
  bloqueado?: boolean;
  motivoBloqueo?: string;
  /** Clave de la imagen que se está guardando (spinner en su tarjeta). */
  ocupada?: string | null;
  /** Casilla final («+ 1 más»). */
  agregar?: ReactNode;
  className?: string;
}

const BOTON =
  'flex size-8 items-center justify-center rounded-md border border-line bg-surface text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50';

export function GaleriaEditable({
  items,
  onVer,
  onPrincipal,
  onAlt,
  onMover,
  onReordenar,
  onQuitar,
  modoAlt = 'alSalir',
  verboQuitar = 'eliminar',
  bloqueado = false,
  motivoBloqueo,
  ocupada,
  agregar,
  className,
}: GaleriaEditableProps) {
  const t = useTranslations('productoDetalle.imagenes');
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);
  const [fallidas, setFallidas] = useState<ReadonlySet<string>>(new Set());
  const titulo = bloqueado ? motivoBloqueo : undefined;

  return (
    <ul className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-4', className)} aria-label={t('titulo')}>
      {items.map((img, i) => {
        const nombre = img.alt || t('imagenN', { n: i + 1 });
        const fallida = fallidas.has(img.url) || !img.url;
        return (
          <li
            key={img.clave}
            draggable={!bloqueado && items.length > 1}
            onDragStart={(e) => {
              setArrastrando(i);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              if (arrastrando === null) return;
              e.preventDefault();
              setSobre(i);
            }}
            onDragLeave={() => setSobre((s) => (s === i ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              if (arrastrando !== null && arrastrando !== i) onReordenar(arrastrando, i);
              setArrastrando(null);
              setSobre(null);
            }}
            onDragEnd={() => {
              setArrastrando(null);
              setSobre(null);
            }}
            className={cn('flex min-w-0 flex-col gap-2', arrastrando === i && 'opacity-50')}
          >
            <button
              type="button"
              onClick={() => onVer(i)}
              aria-label={t('acciones.verNombre', { nombre })}
              className={cn(
                'relative aspect-square w-full overflow-hidden rounded-lg border bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                img.principal ? 'border-line-brand ring-2 ring-brand' : 'border-line',
                sobre === i && arrastrando !== i && 'ring-2 ring-brand ring-offset-2',
              )}
            >
              {fallida ? (
                <span className="flex size-full flex-col items-center justify-center gap-1 text-fg-muted">
                  <ImageOff className="size-6" aria-hidden />
                  <span className="text-xs">{t('sinImagen')}</span>
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- imágenes públicas del bucket u object URL
                <img
                  src={img.url}
                  alt={img.alt}
                  onError={() => setFallidas((s) => new Set(s).add(img.url))}
                  className="size-full object-cover"
                  draggable={false}
                />
              )}
              {ocupada === img.clave && (
                <span className="absolute inset-0 flex items-center justify-center bg-surface/60">
                  <Loader2 className="size-5 animate-spin text-fg-secondary" aria-hidden />
                </span>
              )}
              {img.insignia && (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-surface/90 px-1.5 py-0.5 text-[10px] font-medium text-fg-secondary">
                  {img.insignia}
                </span>
              )}
            </button>

            <div className="flex min-h-5 items-center gap-1.5">
              {img.principal && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand-deep">
                  <Star className="size-3 fill-current" aria-hidden /> {t('principal')}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t('acciones.grupo', { nombre })}>
              <button type="button" className={BOTON} onClick={() => onVer(i)} aria-label={t('acciones.ver')} title={t('acciones.ver')}>
                <Eye className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                className={cn(BOTON, img.principal && 'text-brand')}
                onClick={() => onPrincipal(img.clave)}
                disabled={bloqueado || img.principal}
                aria-pressed={img.principal}
                aria-label={img.principal ? t('acciones.esPrincipal') : t('acciones.hacerPrincipal')}
                title={titulo ?? (img.principal ? t('acciones.esPrincipal') : t('acciones.hacerPrincipal'))}
              >
                <Star className={cn('size-4', img.principal && 'fill-current')} aria-hidden />
              </button>
              <button
                type="button"
                className={BOTON}
                onClick={() => onMover(img.clave, -1)}
                disabled={bloqueado || i === 0}
                aria-label={t('acciones.antes')}
                title={titulo ?? t('acciones.antes')}
              >
                <ArrowLeft className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                className={BOTON}
                onClick={() => onMover(img.clave, 1)}
                disabled={bloqueado || i === items.length - 1}
                aria-label={t('acciones.despues')}
                title={titulo ?? t('acciones.despues')}
              >
                <ArrowRight className="size-4" aria-hidden />
              </button>
              {items.length > 1 && !bloqueado && (
                <span className="hidden size-8 cursor-grab items-center justify-center text-fg-muted lg:flex" title={t('acciones.arrastrar')} aria-hidden>
                  <GripVertical className="size-4" />
                </span>
              )}
              <button
                type="button"
                className={cn(BOTON, 'text-danger-text hover:text-danger-text')}
                onClick={() => onQuitar(img.clave)}
                disabled={bloqueado}
                aria-label={verboQuitar === 'eliminar' ? t('acciones.eliminar') : t('acciones.quitar')}
                title={titulo ?? (verboQuitar === 'eliminar' ? t('acciones.eliminar') : t('acciones.quitar'))}
              >
                {verboQuitar === 'eliminar' ? <Trash2 className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
              </button>
            </div>

            <CampoAlt valor={img.alt} modo={modoAlt} deshabilitado={bloqueado} onCambio={(v) => onAlt(img.clave, v)} nombre={nombre} />
          </li>
        );
      })}
      {agregar && <li className="flex min-w-0 flex-col">{agregar}</li>}
    </ul>
  );
}

function CampoAlt({
  valor,
  modo,
  deshabilitado,
  onCambio,
  nombre,
}: {
  valor: string;
  modo: 'alSalir' | 'inmediato';
  deshabilitado: boolean;
  onCambio: (v: string) => void;
  nombre: string;
}) {
  const t = useTranslations('productoDetalle.imagenes');
  const [local, setLocal] = useState(valor);
  useEffect(() => setLocal(valor), [valor]);
  return (
    <Input
      value={local}
      maxLength={200}
      disabled={deshabilitado}
      placeholder={t('alt.placeholder')}
      aria-label={t('alt.etiqueta', { nombre })}
      onChange={(e) => {
        setLocal(e.target.value);
        if (modo === 'inmediato') onCambio(e.target.value);
      }}
      onBlur={() => {
        if (modo === 'alSalir' && local.trim() !== valor.trim()) onCambio(local.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="h-8 text-xs"
    />
  );
}

/**
 * Botones para agregar imágenes: Subir (varias), Tomar foto (cámara, solo
 * móvil), Generar con IA y Desde la biblioteca. `zona` = recuadro punteado
 * que además acepta arrastrar y soltar archivos (vacío y móvil).
 */
export function AccionesAgregarImagen({
  onArchivos,
  onGenerarIA,
  onBiblioteca,
  cupo,
  maximo,
  subiendo = false,
  generando = false,
  deshabilitado = false,
  motivo,
  variante = 'barra',
  className,
}: {
  onArchivos: (archivos: File[]) => void;
  onGenerarIA?: () => void;
  onBiblioteca?: () => void;
  /** Imágenes que aún caben. */
  cupo: number;
  maximo: number;
  subiendo?: boolean;
  generando?: boolean;
  deshabilitado?: boolean;
  motivo?: string;
  variante?: 'barra' | 'zona';
  className?: string;
}) {
  const t = useTranslations('productoDetalle.imagenes');
  const archivoRef = useRef<HTMLInputElement>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);
  const lleno = cupo <= 0;
  const bloqueado = deshabilitado || lleno || subiendo;
  const motivoFinal = deshabilitado ? motivo : lleno ? t('limite.lleno', { max: maximo }) : undefined;

  const entregar = (lista: FileList | null) => {
    const archivos = Array.from(lista ?? []);
    if (archivos.length > 0) onArchivos(archivos);
  };

  const entradas = (
    <>
      <input
        ref={archivoRef}
        type="file"
        accept={ACEPTAR_IMAGENES}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          entregar(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={camaraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          entregar(e.target.files);
          e.target.value = '';
        }}
      />
    </>
  );

  const botones = (
    <>
      <Button
        type="button"
        size="sm"
        variant={variante === 'barra' ? 'default' : 'outline'}
        onClick={() => archivoRef.current?.click()}
        disabled={bloqueado}
        title={motivoFinal}
        className="gap-1.5"
      >
        {subiendo ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
        {subiendo ? t('subiendo') : variante === 'barra' ? t('subir') : t('subirCorto')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => camaraRef.current?.click()}
        disabled={bloqueado}
        title={motivoFinal}
        className="gap-1.5 lg:hidden"
      >
        <Camera className="size-4" aria-hidden /> {t('tomarFoto')}
      </Button>
      {onGenerarIA && (
        <Button type="button" size="sm" variant="outline" onClick={onGenerarIA} disabled={bloqueado || generando} title={motivoFinal} className="gap-1.5">
          {generando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          {t('generarIA')}
        </Button>
      )}
      {onBiblioteca && (
        <Button type="button" size="sm" variant="outline" onClick={onBiblioteca} disabled={bloqueado} title={motivoFinal} className="gap-1.5">
          <Images className="size-4" aria-hidden /> {t('biblioteca')}
        </Button>
      )}
    </>
  );

  if (variante === 'barra') {
    return (
      <div className={cn('flex flex-wrap items-center gap-2', className)}>
        {entradas}
        {botones}
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        if (bloqueado || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        if (bloqueado || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setEncima(false);
        entregar(e.dataTransfer.files);
      }}
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-6 text-center',
        encima ? 'border-line-brand bg-brand-tint' : 'border-line-strong bg-subtle',
        className,
      )}
    >
      {entradas}
      <span className="flex size-10 items-center justify-center rounded-lg bg-brand-tint text-brand" aria-hidden>
        <ImagePlus className="size-5" />
      </span>
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-fg">{t('zona.titulo')}</p>
        <p className="text-xs text-fg-secondary">{t('zona.ayuda', { max: maximo })}</p>
        {motivoFinal && <p className="text-xs text-warning-text">{motivoFinal}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">{botones}</div>
    </div>
  );
}
