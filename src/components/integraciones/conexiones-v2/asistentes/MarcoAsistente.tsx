'use client';

/**
 * Marco común de los asistentes de conexión (diseño 85-03…44): cabecera con logo, título y
 * «Paso N de M · subtítulo», pasos (`Stepper` del kit), cuerpo con scroll y pie con los botones
 * del paso. Se usa en lugar de `Dialogo` porque aquí el botón secundario es «Atrás» (no cierra)
 * y cada paso decide sus botones. Mismas clases que `Dialogo`: tokens semánticos, sin `dark:`.
 */
import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Stepper, clasesBoton, type PasoStepper, type VarianteBoton } from '@/components/kit';
import { LogoServicio } from '@/components/integraciones/conexiones-v2/logos';
import { cn } from '@/utils/Utils';

export interface BotonMarco {
  etiqueta: string;
  onClick: () => void;
  variante?: VarianteBoton;
  deshabilitado?: boolean;
  cargando?: boolean;
  /** Por qué está deshabilitado (title). */
  motivo?: string;
}

export interface MarcoAsistenteProps {
  abierto: boolean;
  onCerrar: () => void;
  servicioId: string;
  titulo: string;
  subtitulo?: ReactNode;
  pasos?: readonly PasoStepper[];
  actual?: string;
  children: ReactNode;
  /** Botones del pie, de izquierda a derecha (el último es el principal). */
  botones: BotonMarco[];
  /** Mientras hay una llamada en curso no se cierra. */
  ocupado?: boolean;
}

export function MarcoAsistente({ abierto, onCerrar, servicioId, titulo, subtitulo, pasos, actual, children, botones, ocupado }: MarcoAsistenteProps) {
  const t = useTranslations('integracionesConexiones');
  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && !ocupado && onCerrar()}>
      <DialogContent
        hideCloseButton
        className="flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-none flex-col gap-0 overflow-hidden rounded-xl border-line bg-surface p-0 text-fg sm:max-w-[640px] sm:rounded-xl"
      >
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          <LogoServicio id={servicioId} tamano="md" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <DialogTitle className="text-lg font-semibold leading-6 text-fg">{titulo}</DialogTitle>
            <DialogDescription className={cn('text-sm leading-5 text-fg-secondary', !subtitulo && 'sr-only')}>{subtitulo ?? titulo}</DialogDescription>
          </div>
          <button
            type="button"
            aria-label={t('comun.cerrar')}
            disabled={ocupado}
            onClick={onCerrar}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
          >
            <X aria-hidden="true" className="size-5" strokeWidth={1.5} />
          </button>
        </div>
        {pasos && pasos.length > 1 && actual && (
          <div className="px-5 pb-2">
            <Stepper
              pasos={pasos}
              actual={actual}
              etiqueta={t('asistente.comun.pasos')}
              resumenMovil={(n, total, etiqueta) => t('asistente.comun.resumenPaso', { n, total, etiqueta })}
            />
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex flex-col-reverse gap-2 border-t border-line bg-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
          {botones.map((b, i) => (
            <button
              key={b.etiqueta}
              type="button"
              onClick={b.onClick}
              disabled={b.deshabilitado || b.cargando}
              aria-busy={b.cargando || undefined}
              title={b.deshabilitado ? b.motivo : undefined}
              className={clasesBoton({ variante: b.variante ?? (i === botones.length - 1 ? 'primario' : 'fantasma') })}
            >
              {b.etiqueta}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Lista numerada de instrucciones (85-02, 85-04, 85-09). */
export function ListaNumerada({ items }: { items: readonly ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-3 text-sm leading-5 text-fg">
          <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-subtle text-xs font-medium text-fg-secondary">
            {i + 1}
          </span>
          <span className="pt-0.5">{it}</span>
        </li>
      ))}
    </ol>
  );
}

/** Caja de solo lectura con un valor y el botón Copiar (URL de webhook, enlace iCal). */
export function CampoCopiar({ valor, etiquetaCopiar, etiquetaCopiado, onCopiado }: { valor: string; etiquetaCopiar: string; etiquetaCopiado: string; onCopiado?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-subtle px-4 py-2.5">
      <code className="min-w-0 flex-1 truncate text-sm text-fg" title={valor}>{valor}</code>
      <BotonCopiar valor={valor} etiqueta={etiquetaCopiar} etiquetaCopiado={etiquetaCopiado} onCopiado={onCopiado} />
    </div>
  );
}

function BotonCopiar({ valor, etiqueta, etiquetaCopiado, onCopiado }: { valor: string; etiqueta: string; etiquetaCopiado: string; onCopiado?: () => void }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(valor);
          setCopiado(true);
          onCopiado?.();
          setTimeout(() => setCopiado(false), 2000);
        } catch {
          setCopiado(false);
        }
      }}
    >
      {copiado ? etiquetaCopiado : etiqueta}
    </button>
  );
}
