'use client';

import { useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, Plus, X } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Input } from '@/components/ui/input';
import {
  TOKENS_PATRON,
  insertarToken,
  previsualizarSerial,
  validarPatron,
  type TokenPatron,
} from '../../logica/seriales';

/**
 * Constructor del patrón de seriales: campo de texto libre + chips de los
 * tokens (se insertan donde está el cursor), el patrón desarmado en piezas
 * que se quitan con «×», plantillas rápidas y vista previa con el mismo
 * reemplazo que el servidor (`previsualizarSerial` ↔ `fn_producto_generar_seriales`).
 *
 * Un solo vocabulario: `{PROD}` (SKU), `{YYYY}` `{YY}` `{MM}` `{DD}` (día de la
 * organización) y los consecutivos `{SEQ}` (6 dígitos), `{####}`, `{###}`,
 * `{##}`. Así conviven los patrones del detalle viejo (`{PROD}-{YYYY}-{####}`)
 * y los del formulario nuevo (`SN-{YYYY}-{SEQ}`).
 */

/** Clave i18n de cada token (las claves no pueden llevar llaves ni #). */
const CLAVE_TOKEN: Record<TokenPatron, string> = {
  '{PROD}': 'prod',
  '{YYYY}': 'yyyy',
  '{YY}': 'yy',
  '{MM}': 'mm',
  '{DD}': 'dd',
  '{SEQ}': 'seq',
  '{####}': 'n4',
  '{###}': 'n3',
  '{##}': 'n2',
};

const PLANTILLAS = ['{PROD}-{YYYY}-{####}', 'SN-{YYYY}{MM}-{SEQ}', '{PROD}-{YY}{MM}{DD}-{###}'] as const;

function esToken(pieza: string): pieza is TokenPatron {
  return (TOKENS_PATRON as readonly string[]).includes(pieza);
}

/** Piezas del patrón: tokens conocidos y texto fijo entre ellos. */
export function piezasPatron(patron: string): string[] {
  return patron.split(/(\{[^{}]+\})/).filter((p) => p !== '');
}

export interface ConstructorPatronSerialProps {
  id?: string;
  valor: string;
  onCambiar: (patron: string) => void;
  /** SKU para `{PROD}` en la vista previa. */
  sku: string;
  /** Día de la organización (YYYY-MM-DD). */
  hoy: string;
  /** Mensaje de error ya traducido (validación del formulario). */
  error?: string | null;
  deshabilitado?: boolean;
  'aria-describedby'?: string;
}

export function ConstructorPatronSerial({
  id,
  valor,
  onCambiar,
  sku,
  hoy,
  error,
  deshabilitado,
  'aria-describedby': describedBy,
}: ConstructorPatronSerialProps) {
  const t = useTranslations('productoForm.trazabilidad');
  const tErr = useTranslations('productoForm.errores');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cursor = useRef<number | null>(null);

  const piezas = useMemo(() => piezasPatron(valor), [valor]);
  const aviso = valor.trim() ? validarPatron(valor) : null;
  const skuVista = sku.trim() || 'SKU';
  const vista = useMemo(() => {
    if (!valor.trim()) return null;
    return {
      uno: previsualizarSerial(valor, { sku: skuVista, fecha: hoy, secuencia: 1 }),
      dos: previsualizarSerial(valor, { sku: skuVista, fecha: hoy, secuencia: 2 }),
    };
  }, [valor, skuVista, hoy]);

  const recordarCursor = () => {
    cursor.current = inputRef.current?.selectionStart ?? null;
  };

  const agregar = (token: TokenPatron) => {
    const r = insertarToken(valor, token, cursor.current ?? undefined);
    onCambiar(r.patron);
    cursor.current = r.cursor;
    // Deja el cursor justo después del token insertado.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(r.cursor, r.cursor);
    });
  };

  const quitarPieza = (indice: number) => {
    const nuevo = piezas.filter((_, i) => i !== indice).join('');
    onCambiar(nuevo);
    cursor.current = null;
  };

  return (
    <div className="space-y-3">
      <Input
        ref={inputRef}
        id={id}
        value={valor}
        disabled={deshabilitado}
        onChange={(e) => {
          onCambiar(e.target.value);
          cursor.current = e.target.selectionStart;
        }}
        onSelect={recordarCursor}
        onKeyUp={recordarCursor}
        onClick={recordarCursor}
        placeholder={t('patron.placeholder')}
        spellCheck={false}
        autoComplete="off"
        className="font-mono"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />

      {/* Tokens: se insertan en el cursor */}
      <div>
        <p className="mb-1.5 text-xs text-fg-secondary">{t('patron.tokens')}</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('patron.tokens')}>
          {TOKENS_PATRON.map((token) => {
            const usado = valor.includes(token);
            return (
              <button
                key={token}
                type="button"
                disabled={deshabilitado}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => agregar(token)}
                title={t(`patron.ayudaToken.${CLAVE_TOKEN[token]}`)}
                aria-label={t('patron.insertar', { token: t(`patron.ayudaToken.${CLAVE_TOKEN[token]}`) })}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50',
                  usado ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line bg-surface text-fg hover:bg-hover',
                )}
              >
                <code className="font-mono">{token}</code>
                <span className="hidden text-fg-secondary sm:inline">{t(`patron.ayudaToken.${CLAVE_TOKEN[token]}`)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Patrón desarmado: cada pieza se puede quitar */}
      {piezas.length > 0 && (
        <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-subtle p-2" aria-label={t('patron.piezas')}>
          {piezas.map((pieza, i) => (
            <span
              key={`${i}-${pieza}`}
              className={cn(
                'inline-flex h-6 items-center gap-1 rounded-md px-1.5 font-mono text-xs',
                esToken(pieza) ? 'bg-brand-tint text-brand-deep' : 'border border-line bg-surface text-fg',
              )}
            >
              {pieza}
              <button
                type="button"
                disabled={deshabilitado}
                onClick={() => quitarPieza(i)}
                aria-label={t('patron.quitar', { pieza })}
                className="flex size-4 items-center justify-center rounded text-fg-muted hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Plantillas rápidas (solo con el campo vacío) */}
      {!valor.trim() && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-fg-secondary">{t('patron.plantillas')}</span>
          {PLANTILLAS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={deshabilitado}
              onClick={() => onCambiar(p)}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-line-strong px-2 font-mono text-xs text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden="true" className="size-3" />
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Vista previa */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-fg-secondary" aria-live="polite">
        <Eye aria-hidden="true" className="size-3.5" />
        <span>{t('patron.vistaPrevia')}</span>
        {vista ? (
          <>
            <code className="rounded bg-subtle px-1.5 py-0.5 font-mono text-fg">{vista.uno}</code>
            {vista.dos !== vista.uno && (
              <>
                <span aria-hidden="true">·</span>
                <code className="rounded bg-subtle px-1.5 py-0.5 font-mono text-fg">{vista.dos}</code>
              </>
            )}
          </>
        ) : (
          <span className="text-fg-muted">{t('patron.vistaVacia')}</span>
        )}
      </div>

      {!error && aviso === 'patron_sin_consecutivo' && <p className="text-xs text-warning-text">{tErr('patron_sin_consecutivo')}</p>}
    </div>
  );
}
