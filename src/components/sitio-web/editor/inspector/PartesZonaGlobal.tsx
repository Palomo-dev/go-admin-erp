'use client';

/**
 * Piezas comunes de los paneles «Encabezado» y «Pie de página» (Figma 2058:40377 y 2064:102):
 * cabecera con «Global · aparece en todas las páginas», banda «Cambia en todas las páginas»,
 * tarjeta «Valores por defecto de la plantilla», etiquetas de grupo, filas con interruptor e
 * insignia «Nuevo», selector «Sigue el tema | Fijar color» y las miniaturas de composición.
 * Solo presentación y kit; la lógica está en `zonaGlobalLogica.ts`.
 */
import { useId, type ReactNode } from 'react';
import { Check, Globe, RotateCcw, X } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { ChipsOpcion, clasesBoton } from '@/components/kit';
import { clasesBadgeTono } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { ColorField } from '@/components/sitio-web/ui/ColorField';
import { useTextosEditor } from '../textos';

export function CabeceraZona({ titulo, onRestablecer, onCerrar }: { titulo: string; onRestablecer: () => void; onCerrar: () => void }) {
  const t = useTextosEditor();
  const zona = titulo.toLowerCase();
  return (
    <div className="flex items-start gap-2 px-4 pt-4">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="text-base font-semibold leading-[22px] text-fg">{titulo}</h2>
        <p className="text-xs font-medium leading-4 text-fg-secondary">{t('zonaGlobal.global')}</p>
      </div>
      <button
        type="button"
        onClick={onRestablecer}
        aria-label={t('zonaGlobal.restablecer')}
        title={t('zonaGlobal.restablecer')}
        className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 px-0')}
      >
        <RotateCcw aria-hidden="true" className="size-4" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={onCerrar}
        aria-label={t('zonaGlobal.cerrar', { zona })}
        className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 px-0')}
      >
        <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}

export function BandaGlobal() {
  const t = useTextosEditor();
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line-info bg-info-subtle px-3 py-2">
      <Globe aria-hidden="true" className="size-4 shrink-0 text-info-text" strokeWidth={1.5} />
      <p className="text-sm font-medium text-info-text">{t('zonaGlobal.cambiaEnTodas')}</p>
    </div>
  );
}

export function TarjetaPlantilla({ nombre, enBorrador }: { nombre: string | null; enBorrador: boolean }) {
  const t = useTextosEditor();
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-subtle px-3 py-2.5">
      <p className="text-[13px] font-semibold leading-[18px] text-fg">
        {nombre ? t('zonaGlobal.plantilla.titulo', { plantilla: nombre }) : t('zonaGlobal.plantilla.tituloGiro')}
      </p>
      <p className="text-xs leading-4 text-fg-secondary">{enBorrador ? t('zonaGlobal.plantilla.texto') : t('zonaGlobal.plantilla.textoLegacy')}</p>
    </div>
  );
}

/** Etiqueta de grupo (Figma «Label»: 12/16 semibold, texto secundario). */
export function EtiquetaGrupo({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="text-xs font-semibold leading-4 text-fg-secondary">
      {children}
    </p>
  );
}

/** Título de bloque dentro de una pestaña (Figma: «Menú», «Botón principal»… 13/18 semibold). */
export function TituloBloque({ children }: { children: ReactNode }) {
  return <h3 className="text-[13px] font-semibold leading-[18px] text-fg">{children}</h3>;
}

export function InsigniaNuevo() {
  const t = useTextosEditor();
  return (
    // `span` (no el `div` de Badge): va dentro de etiquetas y párrafos.
    <span className={clasesBadgeTono('advertencia', 'suave', 'sm')}>{t('zonaGlobal.nuevo')}</span>
  );
}

export interface FilaInterruptorProps {
  titulo: string;
  ayuda?: string;
  valor: boolean;
  onCambiar: (v: boolean) => void;
  nuevo?: boolean;
  deshabilitado?: boolean;
  motivo?: string;
}

/** Fila «título + ayuda · interruptor» (Figma: «Carrito · show_header_cart»). */
export function FilaInterruptor({ titulo, ayuda, valor, onCambiar, nuevo, deshabilitado, motivo }: FilaInterruptorProps) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3" title={deshabilitado ? motivo : undefined}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className={cn('flex flex-wrap items-center gap-1.5 text-[13px] font-medium leading-[18px] text-fg', deshabilitado && 'opacity-60')}>
          {titulo}
          {nuevo && <InsigniaNuevo />}
        </label>
        {(ayuda || (deshabilitado && motivo)) && (
          <p className="text-[11px] leading-[14px] text-fg-muted">{deshabilitado && motivo ? motivo : ayuda}</p>
        )}
      </div>
      <Switch id={id} checked={valor} onCheckedChange={onCambiar} disabled={deshabilitado} className="mt-0.5 shrink-0" />
    </div>
  );
}

export interface ColorTemaProps {
  etiqueta: string;
  /** `null` = sigue el tema. */
  valor: string | null;
  /** Color con el que arranca «Fijar color» (el del tema). */
  colorTema: string;
  onCambiar: (v: string | null) => void;
  fondo?: string;
}

/** «Sigue el tema | Fijar color» + campo de color (Figma 11, pestaña Estilo). */
export function ColorTema({ etiqueta, valor, colorTema, onCambiar, fondo }: ColorTemaProps) {
  const t = useTextosEditor();
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <EtiquetaGrupo id={id}>{etiqueta}</EtiquetaGrupo>
      <ChipsOpcion
        aria-labelledby={id}
        opciones={[
          { valor: 'tema', etiqueta: t('zonaGlobal.estilo.sigueTema') },
          { valor: 'fijo', etiqueta: t('zonaGlobal.estilo.fijarColor') },
        ]}
        valor={valor ? 'fijo' : 'tema'}
        onValorChange={(v) => onCambiar(v === 'tema' ? null : (valor ?? colorTema))}
      />
      {valor && <ColorField etiqueta={t('zonaGlobal.estilo.color')} valor={valor} onCambiar={onCambiar} fondo={fondo} />}
    </div>
  );
}

/** Tarjeta de composición seleccionable (Figma «HeaderLayoutThumb»: 64 px de miniatura y nombre). */
export function TarjetaComposicion({ etiqueta, seleccionada, onElegir, children }: { etiqueta: string; seleccionada: boolean; onElegir: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={seleccionada}
      onClick={onElegir}
      className={cn(
        'flex w-full flex-col gap-2 rounded-lg p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        seleccionada ? 'border-2 border-brand-action bg-brand-tint' : 'border border-line bg-surface hover:bg-hover',
      )}
    >
      <span aria-hidden="true" className="relative block h-16 w-full overflow-hidden rounded-md bg-subtle">
        {children}
      </span>
      <span className="flex items-center gap-1 px-0.5">
        <span className={cn('min-w-0 flex-1 truncate text-[13px] leading-[18px]', seleccionada ? 'text-brand-deep' : 'text-fg')}>{etiqueta}</span>
        {seleccionada && <Check aria-hidden="true" className="size-4 text-brand-deep" strokeWidth={1.5} />}
      </span>
    </button>
  );
}

// Piezas de las miniaturas (posiciones del componente de Figma 1766:37503, en px sobre 152×64).
const Logo = ({ x, y = 8, w = 14 }: { x: number; y?: number; w?: number }) => (
  <span className="absolute h-2.5 rounded-sm bg-brand" style={{ left: x, top: y, width: w }} />
);
const Enlace = ({ x, y = 12 }: { x: number; y?: number }) => <span className="absolute h-[3px] w-3.5 rounded-sm bg-line-strong" style={{ left: x, top: y }} />;
const Punto = ({ x, y = 10 }: { x: number; y?: number }) => <span className="absolute size-1.5 rounded-full bg-fg-secondary" style={{ left: x, top: y }} />;
const Cta = ({ x, y = 10, w = 10 }: { x: number; y?: number; w?: number }) => (
  <span className="absolute h-1.5 rounded-sm bg-brand-action" style={{ left: x, top: y, width: w }} />
);

/** Miniatura de una composición del encabezado. */
export function MiniaturaEncabezado({ composicion }: { composicion: string }) {
  switch (composicion) {
    case 'centered':
      return (
        <>
          <Logo x={66} y={6} w={20} />
          <Punto x={136} y={8} />
          <span className="absolute left-0 top-[22px] h-px w-full bg-line" />
          {[41, 59, 77, 95].map((x) => <Enlace key={x} x={x} y={28} />)}
        </>
      );
    case 'split':
      return (
        <>
          {[8, 26, 44].map((x) => <Enlace key={x} x={x} />)}
          <Logo x={68} w={16} />
          {[92, 110].map((x) => <Enlace key={x} x={x} />)}
          <Cta x={132} w={12} />
        </>
      );
    case 'minimal':
      return (
        <>
          <Logo x={8} />
          <Punto x={118} />
          {[9, 13, 17].map((y) => <span key={y} className="absolute h-0.5 w-3 bg-fg-secondary" style={{ left: 132, top: y }} />)}
        </>
      );
    case 'mega':
      return (
        <>
          <Logo x={8} y={6} />
          <span className="absolute left-8 top-[7px] h-2 w-16 rounded-full bg-surface" />
          <Punto x={124} y={8} />
          <Cta x={134} y={8} />
          <span className="absolute left-0 top-5 h-2.5 w-full bg-line" />
          {[8, 26, 44, 62, 80].map((x) => <Enlace key={x} x={x} y={24} />)}
          <span className="absolute left-2 top-8 h-7 w-[136px] rounded-sm bg-surface" />
          {[14, 46, 78, 110].map((x) => (
            <span key={x}>
              <span className="absolute h-[3px] w-[26px] bg-fg-secondary" style={{ left: x, top: 38 }} />
              <span className="absolute h-0.5 w-5 bg-line-strong" style={{ left: x, top: 45 }} />
              <span className="absolute h-0.5 w-[22px] bg-line-strong" style={{ left: x, top: 51 }} />
            </span>
          ))}
        </>
      );
    default:
      return (
        <>
          <Logo x={8} />
          {[44, 62, 80, 98].map((x) => <Enlace key={x} x={x} />)}
          <Punto x={120} />
          <Punto x={130} />
          <Cta x={140} />
        </>
      );
  }
}

/** Miniatura de una composición del pie (Figma 11: bloques sobre fondo gris). */
export function MiniaturaPie({ composicion }: { composicion: string }) {
  const bloque = (x: number, w = 22) => <span key={x} className="absolute top-3 h-[22px] rounded-sm bg-line-strong" style={{ left: x, width: w }} />;
  switch (composicion) {
    case 'three_columns':
      return <>{[12, 40, 68].map((x) => bloque(x))}</>;
    case 'centered':
    case 'minimal':
      return <span className="absolute left-3 top-3 h-[18px] w-24 rounded-sm bg-line-strong" />;
    default:
      return <>{[12, 40, 68, 96].map((x) => bloque(x))}</>;
  }
}

/** Campo de texto con la etiqueta de grupo de Figma (12/16 semibold). Vacío = `null`. */
export function CampoTexto({ etiqueta, valor, onCambiar, placeholder, max }: { etiqueta: string; valor: string; onCambiar: (v: string | null) => void; placeholder?: string; max?: number }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <EtiquetaGrupo id={id}>{etiqueta}</EtiquetaGrupo>
      <Input aria-labelledby={id} value={valor} placeholder={placeholder} maxLength={max} onChange={(e) => onCambiar(e.target.value === '' ? null : e.target.value)} />
    </div>
  );
}
