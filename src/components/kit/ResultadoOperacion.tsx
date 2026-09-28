'use client';

import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, CloudOff, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { FilaDato, ListaDatos, type FilaDatoProps } from './FilaDato';
import { KbdButton } from './KbdButton';
import { useKitT } from './useIdiomaKit';

/**
 * Resultado de una operación (Figma `247:74846` «¡Venta completada!»,
 * `247:75030` sin conexión, `250:83088` móvil): post-venta del POS, cierre de
 * caja, cobro de CxC, pago registrado.
 *
 * Icono del tono, título, descripción, referencia (número o «OFF-…» pendiente
 * de sincronizar), cifras (`FilaDato`: Total · Pagado · Cambio), aviso (recibo
 * enviado, sin impresora) y acciones con su atajo: primaria («Nueva venta ·
 * Enter»), secundarias («Reimprimir · P», «Factura electrónica · F») y
 * «Cerrar · Esc». El registro de teclas lo hace la pantalla (`useAtajos`).
 */
export interface AccionResultado {
  etiqueta: string;
  onClick: () => void;
  atajo?: string;
  icono?: LucideIcon;
  deshabilitada?: boolean;
  /** Por qué está deshabilitada (FE sin CUFE). */
  motivo?: string;
  cargando?: boolean;
}

export type TonoResultado = 'exito' | 'advertencia' | 'peligro';

export interface ResultadoOperacionProps {
  tono?: TonoResultado;
  titulo: string;
  descripcion?: ReactNode;
  icono?: LucideIcon;
  /** «V-2144», «OFF-3F2A» (en mono). */
  referencia?: string | null;
  cifras?: readonly FilaDatoProps[];
  aviso?: ReactNode;
  primaria?: AccionResultado;
  secundarias?: readonly AccionResultado[];
  onCerrar?: () => void;
  textoCerrar?: string;
  /** Por defecto «Esc». */
  atajoCerrar?: string | false;
  className?: string;
}

const TONO: Record<TonoResultado, { icono: LucideIcon; caja: string }> = {
  exito: { icono: CircleCheck, caja: 'bg-success-subtle text-success-text' },
  advertencia: { icono: CloudOff, caja: 'bg-warning-subtle text-warning-text' },
  peligro: { icono: CircleAlert, caja: 'bg-danger-subtle text-danger-text' },
};

export function ResultadoOperacion({
  tono = 'exito',
  titulo,
  descripcion,
  icono,
  referencia,
  cifras,
  aviso,
  primaria,
  secundarias,
  onCerrar,
  textoCerrar,
  atajoCerrar = 'Esc',
  className,
}: ResultadoOperacionProps) {
  const t = useKitT();
  const Icono = icono ?? TONO[tono].icono;
  return (
    <div className={cn('flex w-full flex-col items-center gap-4 text-center', className)}>
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-3">
        <span aria-hidden="true" className={cn('flex size-14 items-center justify-center rounded-full', TONO[tono].caja)}>
          <Icono className="size-7" strokeWidth={1.5} />
        </span>
        <h2 className="text-xl font-semibold leading-7 text-fg">{titulo}</h2>
        {descripcion && <p className="max-w-md text-sm leading-5 text-fg-secondary">{descripcion}</p>}
        {referencia && (
          <span className="rounded-md border border-line bg-subtle px-2 py-0.5 font-mono text-[13px] tabular-nums text-fg-secondary">{referencia}</span>
        )}
      </div>

      {cifras && cifras.length > 0 && (
        <ListaDatos etiqueta={t('resultado.cifras')} className="w-full max-w-sm rounded-lg border border-line bg-surface px-3 py-2 text-left">
          {cifras.map((c, i) => (
            <FilaDato key={i} {...c} />
          ))}
        </ListaDatos>
      )}

      {aviso && <div className="w-full max-w-sm rounded-lg bg-subtle px-3 py-2.5 text-left text-[13px] leading-5 text-fg-secondary">{aviso}</div>}

      <div className="flex w-full max-w-sm flex-col gap-2">
        {primaria && (
          <KbdButton
            autoFocus
            variante="primario"
            tamano="lg"
            anchoCompleto
            icono={primaria.icono}
            atajo={primaria.atajo}
            onClick={primaria.onClick}
            disabled={primaria.deshabilitada}
            cargando={primaria.cargando}
            title={primaria.deshabilitada ? primaria.motivo : undefined}
          >
            {primaria.etiqueta}
          </KbdButton>
        )}
        {secundarias && secundarias.length > 0 && (
          <div className={cn('grid gap-2', secundarias.length > 1 && 'grid-cols-2')}>
            {secundarias.map((s) => (
              <KbdButton
                key={s.etiqueta}
                variante="secundario"
                anchoCompleto
                icono={s.icono}
                atajo={s.atajo}
                onClick={s.onClick}
                disabled={s.deshabilitada}
                cargando={s.cargando}
                title={s.deshabilitada ? s.motivo : undefined}
              >
                {s.etiqueta}
              </KbdButton>
            ))}
          </div>
        )}
        {onCerrar && (
          <KbdButton variante="fantasma" anchoCompleto atajo={atajoCerrar || undefined} onClick={onCerrar}>
            {textoCerrar ?? t('comun.cerrar')}
          </KbdButton>
        )}
      </div>
    </div>
  );
}
