'use client';

import { AlertTriangle, Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { NOTA_MAX } from '@/lib/pos/cocina/lineasCarrito';
import { ChipsNotasRapidas, type DestinoNota } from '@/components/pos/cocina/ChipsNotasRapidas';

/**
 * Editor de la nota de una línea del carrito (ranura `editorNota` de
 * `CartLine`). Es el editor de siempre —destino cocina / cliente, alergia,
 * campo, Guardar / Cancelar y las notas rápidas (`ChipsNotasRapidas`)—
 * revestido con los tokens del kit. Guardar lo hace la pantalla
 * (`POSService.updateCartItemNote`, N1).
 */
export interface EditorNotaLineaProps {
  branchId: number | null | undefined;
  destino: DestinoNota;
  alergia: boolean;
  texto: string;
  onDestino: (destino: DestinoNota) => void;
  onAlergia: (alergia: boolean) => void;
  onTexto: (texto: string) => void;
  onGuardar: () => void;
  onCancelar: () => void;
}

const BOTON_ICONO =
  'inline-flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

export function EditorNotaLinea({
  branchId,
  destino,
  alergia,
  texto,
  onDestino,
  onAlergia,
  onTexto,
  onGuardar,
  onCancelar,
}: EditorNotaLineaProps) {
  const tNotas = useTranslations('posNotasLinea');
  const etiquetaCampo = destino === 'cliente' ? tNotas('notaCliente') : tNotas('notaCocina');

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-subtle p-2">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={tNotas('destino')}>
        {(['cocina', 'cliente'] as const).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={destino === d}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onDestino(d)}
            className={cn(
              'inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              destino === d
                ? 'border-brand-action bg-brand-action text-fg-on-brand'
                : 'border-line-strong bg-surface text-fg-secondary hover:bg-hover hover:text-fg',
            )}
          >
            {d === 'cocina' ? tNotas('destinoCocina') : tNotas('destinoCliente')}
          </button>
        ))}
        {destino === 'cocina' && (
          <label className="ml-1 inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-danger-text">
            <input
              type="checkbox"
              checked={alergia}
              onChange={(e) => onAlergia(e.target.checked)}
              className="size-3.5 cursor-pointer rounded accent-brand-action"
            />
            <AlertTriangle aria-hidden="true" className="size-3" />
            {tNotas('alergia')}
          </label>
        )}
      </div>
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={texto}
          maxLength={NOTA_MAX}
          onChange={(e) => onTexto(e.target.value)}
          onKeyDown={(e) => {
            // preventDefault: que Enter / Esc no lleguen además a los atajos de la pantalla.
            if (e.key === 'Enter') {
              e.preventDefault();
              onGuardar();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              onCancelar();
            }
          }}
          placeholder={destino === 'cliente' ? tNotas('placeholderCliente') : tNotas('placeholderCocina')}
          aria-label={etiquetaCampo}
          className="h-7 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2 text-xs text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          autoFocus
        />
        <button
          type="button"
          onClick={onGuardar}
          title={tNotas('guardar')}
          aria-label={tNotas('guardar')}
          className={cn(BOTON_ICONO, 'text-success-text hover:bg-success-subtle')}
        >
          <Check aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={onCancelar}
          title={tNotas('cancelar')}
          aria-label={tNotas('cancelar')}
          className={cn(BOTON_ICONO, 'text-fg-secondary hover:bg-hover hover:text-fg')}
        >
          <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
      </div>
      <ChipsNotasRapidas
        branchId={branchId}
        destino={destino}
        onElegir={(textoRapido, esAlergia) => {
          onTexto(textoRapido);
          if (esAlergia) onAlergia(true);
        }}
      />
    </div>
  );
}
