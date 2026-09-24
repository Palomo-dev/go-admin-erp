'use client';

/**
 * Conteo por método de pago (Figma `359:57810` + P-K, «Arqueo por método de
 * pago»): método · esperado (u «Oculto») · contado · diferencia. Cada método se
 * compara contra SU esperado (`diferenciasPorMetodo`, el mismo criterio que
 * `method_breakdown` en el servidor), nunca contra el total.
 *
 * Lo usan el nuevo arqueo (sin la fila de efectivo, que se cuenta por
 * denominaciones) y el cierre de caja (con la fila de efectivo editable cuando
 * no se cuenta por denominaciones).
 */
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { CreditCard } from 'lucide-react';
import { Tarjeta } from '@/components/kit';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { cn } from '@/utils/Utils';
import type { FilaConteoMetodo } from '@/lib/pos/cajas/arqueo';
import { Oculto } from '../listado/comunes';

export interface ConteoPorMetodoProps {
  /** `diferenciasPorMetodo(esperado.por_metodo, contado)`. */
  filas: FilaConteoMetodo[];
  onContadoChange: (metodo: string, valor: number | null) => void;
  etiquetaMetodo: (codigo: string) => string;
  formatear: (valor: number) => string;
  simbolo: string;
  /** El efectivo se escribe aquí (cierre) o viene de las denominaciones (arqueo: solo lectura). */
  efectivoEditable?: boolean;
  /** Mostrar la fila de efectivo. */
  incluirEfectivo?: boolean;
  /** false = cierre ciego sin permiso: esperado y diferencia no se muestran. */
  visible: boolean;
  deshabilitado?: boolean;
  titulo?: string;
  descripcion?: string;
}

function tonoDiferencia(d: number | null): string {
  if (d === null) return 'text-fg-muted';
  if (d <= -0.5) return 'text-danger-text';
  if (d >= 0.5) return 'text-success-text';
  return 'text-fg-secondary';
}

export function ConteoPorMetodo({
  filas,
  onContadoChange,
  etiquetaMetodo,
  formatear,
  simbolo,
  efectivoEditable,
  incluirEfectivo = true,
  visible,
  deshabilitado,
  titulo,
  descripcion,
}: ConteoPorMetodoProps) {
  const t = useTranslations('cajas.conteo');
  const base = useId();
  const visibles = filas.filter((f) => incluirEfectivo || f.metodo !== 'cash');
  if (visibles.length === 0) return null;
  return (
    <Tarjeta titulo={titulo ?? t('porMetodo')} icono={CreditCard} descripcion={descripcion}>
      <div className="flex flex-col divide-y divide-line">
        {visibles.map((f) => {
          const id = `${base}-${f.metodo}`;
          const editable = f.metodo !== 'cash' || efectivoEditable;
          const signo = f.diferencia !== null && f.diferencia > 0 ? '+' : '';
          return (
            <div key={f.metodo} className="grid grid-cols-2 items-center gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_11rem_8rem]">
              <div className="min-w-0">
                <label htmlFor={id} className="block truncate text-sm font-medium text-fg">
                  {etiquetaMetodo(f.metodo)}
                </label>
                <span className="text-xs text-fg-muted">
                  {visible ? t('esperado', { monto: formatear(f.esperado ?? 0) }) : <Oculto />}
                </span>
              </div>
              {editable ? (
                <CampoNumero
                  id={id}
                  valor={f.contado}
                  onValorChange={(v) => onContadoChange(f.metodo, v)}
                  prefijo={simbolo}
                  minimo={0}
                  alinear="derecha"
                  disabled={deshabilitado}
                  aria-describedby={`${id}-dif`}
                />
              ) : (
                <output id={id} className="text-right text-sm font-medium tabular-nums text-fg">
                  {formatear(f.contado ?? 0)}
                </output>
              )}
              <div id={`${id}-dif`} className="col-span-2 flex items-center justify-between gap-2 text-sm sm:col-span-1 sm:justify-end">
                <span className="text-xs text-fg-muted sm:sr-only">{t('diferencia')}</span>
                {visible ? (
                  <span className={cn('font-semibold tabular-nums', tonoDiferencia(f.diferencia))}>
                    {f.diferencia === null ? '—' : `${signo}${formatear(f.diferencia)}`}
                  </span>
                ) : (
                  <Oculto />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Tarjeta>
  );
}
