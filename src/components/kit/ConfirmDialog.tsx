'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { Loader2, type LucideIcon, TriangleAlert, Trash2 } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { clasesBoton } from './botonClases';
import { useKitTextos } from './useIdiomaKit';

/**
 * Confirmación de una acción (Figma Sitio web B/12-02 «¿Eliminar tu sitio
 * web?», B/12-02b «¿Despublicar…?», Dominios «Quitar dominio»): icono en caja
 * de tinte, título que pregunta, descripción con la consecuencia, y
 * «Cancelar» + primario que responde al título («Eliminar sitio»). Radio 16.
 *
 * `confirmarCon`: la persona escribe un texto exacto («tu-marca») para habilitar
 * el primario; lo usa lo irreversible. `ui/confirm-dialog` sigue para lo que ya
 * lo usa; el código nuevo usa este.
 */
export interface ConfirmDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  titulo: string;
  descripcion: ReactNode;
  /** Texto del primario; responde al título. */
  textoConfirmar: string;
  textoCancelar?: string;
  onConfirmar: () => void | Promise<void>;
  /** `peligro` pinta el primario y la caja del icono en rojo. */
  tono?: 'peligro' | 'advertencia' | 'marca';
  icono?: LucideIcon;
  cargando?: boolean;
  /** Texto que hay que escribir para confirmar. */
  confirmarCon?: string;
  /** Contenido extra entre la descripción y los botones. */
  children?: ReactNode;
}

const CAJA = {
  peligro: 'bg-danger-subtle text-danger-text',
  advertencia: 'bg-warning-subtle text-warning-text',
  marca: 'bg-brand-tint text-brand',
} as const;

export function ConfirmDialog({
  abierto,
  onAbiertoChange,
  titulo,
  descripcion,
  textoConfirmar,
  textoCancelar,
  onConfirmar,
  tono = 'peligro',
  icono,
  cargando = false,
  confirmarCon,
  children,
}: ConfirmDialogProps) {
  const tx = useKitTextos();
  const idCampo = useId();
  const [escrito, setEscrito] = useState('');
  useEffect(() => {
    if (!abierto) setEscrito('');
  }, [abierto]);
  const Icono = icono ?? (tono === 'peligro' ? Trash2 : TriangleAlert);
  const bloqueado = !!confirmarCon && escrito.trim() !== confirmarCon;

  return (
    <Dialog open={abierto} onOpenChange={(v) => !cargando && onAbiertoChange(v)}>
      <DialogContent
        hideCloseButton
        className="w-[calc(100%-32px)] max-w-none gap-0 rounded-2xl border-line bg-surface p-6 text-fg sm:max-w-[480px] sm:rounded-2xl"
      >
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', CAJA[tono])}>
            <Icono className="size-5" strokeWidth={1.5} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <DialogTitle className="text-lg font-semibold leading-6 text-fg">{titulo}</DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm leading-5 text-fg-secondary">{descripcion}</div>
            </DialogDescription>
            {confirmarCon && (
              <div className="mt-3 flex flex-col gap-1.5">
                <label htmlFor={idCampo} className="text-[13px] font-medium text-fg">
                  {tx('confirmar.escribe', 'Escribe «{texto}» para confirmar', { texto: confirmarCon })}
                </label>
                <input
                  id={idCampo}
                  value={escrito}
                  onChange={(e) => setEscrito(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                />
              </div>
            )}
            {children}
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={cargando}
            onClick={() => onAbiertoChange(false)}
            className={clasesBoton({ variante: 'secundario', tamano: 'md' })}
          >
            {textoCancelar ?? tx('comun.cancelar', 'Cancelar')}
          </button>
          <button
            type="button"
            disabled={cargando || bloqueado}
            aria-busy={cargando || undefined}
            onClick={() => void onConfirmar()}
            className={clasesBoton({ variante: tono === 'peligro' ? 'destructivo' : 'primario', tamano: 'md' })}
          >
            {cargando && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            {textoConfirmar}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
