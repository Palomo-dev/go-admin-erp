'use client';

import * as React from 'react';
import { Ban, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { ConfirmDialog, clasesBoton, useEsEscritorio } from '@/components/kit';
import { nombreClienteConversacion } from './CabeceraHilo';
import type { ConversacionControl } from './useConversacion';

/**
 * Confirmación destructiva de «Bloquear contacto». La usan el menú «⋯ Más
 * acciones» y la hoja de acciones del celular: una sola pieza para los dos.
 * - Escritorio: diálogo centrado (Figma 93-chat-pendientes-01).
 * - Celular: hoja inferior con asa, icono de prohibido y los dos botones a lo
 *   ancho (Figma 94-chat-recuperado-16).
 */
export function DialogoBloquearContacto({ c, abierto, onAbiertoChange }: { c: ConversacionControl; abierto: boolean; onAbiertoChange: (v: boolean) => void }) {
  const tb = useTranslations('chatBandejaPendientes.bloqueo');
  const esEscritorio = useEsEscritorio();
  const [bloqueando, setBloqueando] = React.useState(false);
  const nombre = nombreClienteConversacion(c.detalle, tb('contacto'));

  const confirmar = async () => {
    setBloqueando(true);
    try {
      if (await c.bloquearContacto()) onAbiertoChange(false);
    } finally {
      setBloqueando(false);
    }
  };

  if (esEscritorio) {
    return (
      <ConfirmDialog
        abierto={abierto}
        onAbiertoChange={onAbiertoChange}
        tono="peligro"
        titulo={tb('confirmarTitulo', { nombre })}
        descripcion={tb('confirmarDescripcion')}
        textoConfirmar={tb('confirmar')}
        textoCancelar={tb('cancelar')}
        cargando={bloqueando}
        onConfirmar={confirmar}
      />
    );
  }

  return (
    <Sheet open={abierto} onOpenChange={(v) => !bloqueando && onAbiertoChange(v)}>
      <SheetContent side="bottom" hideCloseButton className="gap-0 rounded-t-2xl border-line bg-surface px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">
        <div aria-hidden="true" className="mx-auto h-1 w-9 rounded-full bg-line-strong" />
        <div className="mt-4 flex items-start gap-3">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-subtle text-danger-text">
            <Ban className="size-5" strokeWidth={1.5} />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <SheetTitle className="text-lg font-semibold leading-6 text-fg">{tb('confirmarTitulo', { nombre })}</SheetTitle>
            <SheetDescription className="text-sm leading-5 text-fg-secondary">{tb('confirmarDescripcion')}</SheetDescription>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" disabled={bloqueando} onClick={() => onAbiertoChange(false)} className={clasesBoton({ variante: 'secundario', tamano: 'lg', anchoCompleto: true })}>
            {tb('cancelar')}
          </button>
          <button
            type="button"
            disabled={bloqueando}
            aria-busy={bloqueando || undefined}
            onClick={() => void confirmar()}
            className={clasesBoton({ variante: 'destructivo', tamano: 'lg', anchoCompleto: true })}
          >
            {bloqueando ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
            {tb('confirmar')}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
