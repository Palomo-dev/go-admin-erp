'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Ban, CircleAlert, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Dialogo } from './Dialogo';
import { FormField } from './FormField';
import { componerMotivo, MOTIVO_MAXIMO, MOTIVO_MINIMO, validarMotivo } from './motivo';
import { useKitT } from './useIdiomaKit';

/**
 * Confirmación con motivo obligatorio (Figma `331:54986`, «Anular venta»):
 * anular venta, factura, pago o devolución, cerrar la caja de otro cajero,
 * ajustar saldo. Un solo componente para lo que los planes llamaban
 * `DialogoMotivo` y `AnularDocumentoDialog`.
 *
 * - `consecuencias`: la lista «qué se revierte» (stock, pagos, asiento, CxC).
 * - `motivosRapidos`: chips que rellenan el motivo; el detalle escrito se suma.
 * - `bloqueo`: la acción no se puede hacer (factura con pagos, FE aceptada):
 *   se explica arriba y el primario queda deshabilitado con ese motivo. La
 *   salida alternativa («Generar nota crédito») va en `children`.
 *
 * No anula nada: entrega el motivo limpio a `onConfirmar` y la pantalla llama
 * al servicio o a la RPC.
 */
export interface DialogoMotivoProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  titulo: string;
  descripcion?: ReactNode;
  /** Texto del primario, que responde al título («Anular venta»). */
  textoConfirmar: string;
  onConfirmar: (motivo: string) => void | Promise<void>;
  /** Qué se revierte al confirmar. */
  consecuencias?: readonly string[];
  tituloConsecuencias?: string;
  motivosRapidos?: readonly string[];
  etiquetaMotivo?: string;
  placeholder?: string;
  minimo?: number;
  maximo?: number;
  /** Por defecto `true`: el primario va en rojo. */
  destructiva?: boolean;
  cargando?: boolean;
  /** La acción no se puede hacer ahora: por qué. */
  bloqueo?: string | null;
  /** Error del servidor tras confirmar. */
  error?: string | null;
  icono?: LucideIcon;
  /** Contenido extra bajo las consecuencias (alternativa a la acción bloqueada). */
  children?: ReactNode;
}

export function DialogoMotivo({
  abierto,
  onAbiertoChange,
  titulo,
  descripcion,
  textoConfirmar,
  onConfirmar,
  consecuencias,
  tituloConsecuencias,
  motivosRapidos,
  etiquetaMotivo,
  placeholder,
  minimo = MOTIVO_MINIMO,
  maximo = MOTIVO_MAXIMO,
  destructiva = true,
  cargando,
  bloqueo,
  error,
  icono = Ban,
  children,
}: DialogoMotivoProps) {
  const t = useKitT();
  const [rapido, setRapido] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [tocado, setTocado] = useState(false);

  // Cada apertura empieza en blanco.
  useEffect(() => {
    if (abierto) {
      setRapido(null);
      setTexto('');
      setTocado(false);
    }
  }, [abierto]);

  const motivo = componerMotivo(rapido, texto);
  const resultado = validarMotivo(motivo, { minimo, maximo });
  const mensajeError =
    tocado && resultado.error
      ? resultado.error === 'vacio'
        ? t('motivo.errores.vacio')
        : resultado.error === 'corto'
          ? t('motivo.errores.corto', { minimo })
          : t('motivo.errores.largo', { maximo })
      : null;

  const confirmar = () => {
    setTocado(true);
    if (!resultado.valido || bloqueo) return;
    void onConfirmar(resultado.limpio);
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={titulo}
      descripcion={descripcion}
      icono={icono}
      ancho={520}
      primario={{
        etiqueta: textoConfirmar,
        onClick: confirmar,
        destructiva,
        cargando,
        deshabilitada: !!bloqueo,
        motivo: bloqueo ?? undefined,
      }}
    >
      {bloqueo && (
        <div role="note" className="flex items-start gap-2 rounded-lg border border-line-warning bg-warning-subtle px-3 py-2.5 text-sm text-warning-text">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          <span>{bloqueo}</span>
        </div>
      )}

      {consecuencias && consecuencias.length > 0 && (
        <div className="rounded-lg border border-line bg-subtle px-3 py-2.5">
          <p className="text-[13px] font-medium text-fg">{tituloConsecuencias ?? t('motivo.consecuencias')}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] leading-5 text-fg-secondary">
            {consecuencias.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {children}

      {!bloqueo && (
        <>
          {motivosRapidos && motivosRapidos.length > 0 && (
            <div role="group" aria-label={t('motivo.rapidos')} className="flex flex-wrap gap-2">
              {motivosRapidos.map((m) => {
                const activo = rapido === m;
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => setRapido(activo ? null : m)}
                    className={cn(
                      'h-8 rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                      activo ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line-strong bg-surface text-fg-secondary hover:bg-hover hover:text-fg',
                    )}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          )}
          <FormField
            etiqueta={etiquetaMotivo ?? t('motivo.etiqueta')}
            obligatorio={!rapido}
            error={mensajeError}
            extra={
              <span className={cn('text-xs tabular-nums', resultado.largo > maximo ? 'text-danger-text' : 'text-fg-muted')}>
                {t('motivo.contador', { n: resultado.largo, maximo })}
              </span>
            }
          >
            <textarea
              rows={3}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onBlur={() => setTocado(true)}
              placeholder={placeholder ?? t('motivo.placeholder')}
              className="w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 aria-[invalid=true]:border-line-danger"
            />
          </FormField>
        </>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger-text">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          {error}
        </p>
      )}
    </Dialogo>
  );
}
