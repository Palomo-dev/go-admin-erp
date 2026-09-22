'use client';

/**
 * Vista «Emparejar esta pantalla» (Fase 3, parte B; PLAN §3.3 «Otro
 * dispositivo»). Se ve cuando /pos-display se abre en un dispositivo sin
 * token remoto ni caja local, o con `?pair` sin código válido, o tras una
 * revocación. Pide el código de 6 dígitos que genera la caja
 * (Configuración › POS › Pantalla del cliente › Emparejar otro dispositivo)
 * y lo canjea con `submitCode` (useRemoteDisplay).
 *
 * - Campo numérico real (`inputMode="numeric"`), autoenfocado: en un equipo
 *   con teclado se teclea o se pega; el saneado deja solo dígitos
 *   (pairing.ts · normalizePairingCodeInput).
 * - Teclado en pantalla cuando el dispositivo es táctil (PLAN §4.4): una
 *   tableta en modo quiosco no tiene teclado físico y el virtual del sistema
 *   no siempre aparece sobre un campo enfocado por código.
 * - Al sexto dígito se canjea solo (sin botón extra); mientras está en vuelo
 *   se bloquea la entrada. El error se dice en una línea, se limpia al
 *   teclear y VACÍA el campo cuando el canje termina mal, para que se pueda
 *   volver a teclear el código sin tener que borrarlo antes.
 *
 * Nada aquí es de la marca del comercio: aún no se sabe cuál es. Se usa el
 * color neutro (FALLBACK_BRAND_COLOR) y el nombre de la app.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { PAIRING_CODE_LENGTH, isPairingCodeShape, normalizePairingCodeInput } from '@/lib/pos/display/pairing';
import { FALLBACK_BRAND_COLOR } from './logic';
import type { PairingError } from './useRemoteDisplay';

export interface PairingViewProps {
  busy: boolean;
  error: PairingError | null;
  /** Dígitos con los que arranca el campo (lo que traía `?pair=` si no llegaba a 6). */
  prefill?: string;
  /** Detección táctil (readCapabilities). Con táctil se pinta el teclado en pantalla. */
  touch: boolean;
  /**
   * ¿El último fallo CONSERVA el código tecleado? (`shouldKeepPairingCode`:
   * corte de red o 5xx, que no consumen el código en el servidor). Con `true`
   * el campo no se vacía y basta con volver a pulsar «Conectar».
   */
  keepCodeOnError?: boolean;
  /** Segundos que pide esperar un 429 (`Retry-After`); bloquea el reenvío mientras corren. */
  retryAfterSeconds?: number | null;
  onSubmit: (code: string) => void;
  /** Volver al modo local; solo cuando se llegó aquí desde «Conectando». */
  onCancel?: () => void;
}

const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const;

export function PairingView({ busy, error, prefill = '', touch, keepCodeOnError = false, retryAfterSeconds = null, onSubmit, onCancel }: PairingViewProps) {
  const t = useTranslations('posDisplay');
  const [digits, setDigits] = useState(() => normalizePairingCodeInput(prefill));
  /** Último código canjeado desde aquí: no se reenvía el mismo si el padre re-renderiza con `busy` false y error. */
  const submittedRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** `busy` del render anterior: el flanco true → false es «el canje terminó». */
  const wasBusyRef = useRef(busy);
  /** Segundos de espera vigentes, leídos por el efecto del canje automático sin volver a lanzarlo. */
  const esperaRef = useRef(0);

  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  /**
   * Canje terminado con error: se vacía el campo (ronda 2 · 8). Antes se
   * quedaban los seis dígitos en pantalla junto al mensaje de error y el
   * guardarraíl de `submittedRef` impedía reenviar EXACTAMENTE el mismo
   * código, así que pulsar no hacía nada hasta borrar un dígito. Se mira el
   * flanco de `busy` y no el valor de `error` porque dos intentos seguidos
   * dan el mismo error y un efecto sobre `error` no se volvería a ejecutar.
   */
  useEffect(() => {
    const wasBusy = wasBusyRef.current;
    wasBusyRef.current = busy;
    if (wasBusy && !busy && error !== null) {
      submittedRef.current = null;
      // Un fallo que NO consumió el código en el servidor (red o 5xx) conserva
      // los seis dígitos: el cliente no tiene que pedir que se los vuelvan a
      // dictar. `submittedRef` ya se soltó, así que volver a pulsar reenvía.
      if (!keepCodeOnError) setDigits('');
    }
  }, [busy, error, keepCodeOnError]);

  /**
   * `prefill` nuevo tras un fallo que conserva el código (B6): el campo se
   * inicializa una sola vez, así que sin esto el valor que devuelve el hook
   * no entraría nunca. Solo se aplica si hay algo que poner y el campo no
   * tiene ya ese valor, para no pisar lo que la persona esté tecleando.
   */
  useEffect(() => {
    const normalizado = normalizePairingCodeInput(prefill);
    if (normalizado.length === 0) return;
    setDigits((actual) => (actual.length === 0 ? normalizado : actual));
  }, [prefill]);

  // Sexto dígito → canje automático.
  useEffect(() => {
    if (busy || esperaRef.current > 0 || !isPairingCodeShape(digits) || submittedRef.current === digits) return;
    submittedRef.current = digits;
    onSubmit(digits);
  }, [digits, busy, onSubmit]);

  const setFromInput = (raw: string) => {
    if (busy) return;
    const next = normalizePairingCodeInput(raw);
    if (next !== digits) submittedRef.current = null;
    setDigits(next);
  };
  const press = (key: string) => {
    if (busy) return;
    if (key === '⌫') {
      setFromInput(digits.slice(0, -1));
      return;
    }
    setFromInput(digits + key);
  };

  const boxes = Array.from({ length: PAIRING_CODE_LENGTH }, (_, i) => digits[i] ?? '');
  const errorText = error ? t(`pairing.errors.${error}`) : null;
  /**
   * 429: el servidor dice cuántos segundos hay que esperar (`Retry-After`).
   * Mientras corren no se reenvía —ni a mano ni por el sexto dígito— y se
   * dice en la misma línea del error, que es donde el cliente mira.
   */
  const espera = typeof retryAfterSeconds === 'number' && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? Math.ceil(retryAfterSeconds)
    : 0;
  esperaRef.current = espera;

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-[var(--pd-gutter)] py-[var(--pd-gutter)] text-center" data-pairing="true">
      <p className="text-[length:var(--pd-big)] font-semibold text-neutral-900">{t('pairing.title')}</p>
      <p className="max-w-[min(92vw,900px)] text-[length:var(--pd-line)] text-neutral-600">{t('pairing.hint')}</p>

      <label className="relative block w-full max-w-[min(92vw,720px)]">
        <span className="sr-only">{t('pairing.inputLabel')}</span>
        {/* Campo real, encima de las cajas: recibe el foco, el teclado físico y el pegado. */}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={PAIRING_CODE_LENGTH}
          value={digits}
          disabled={busy}
          onChange={(event) => setFromInput(event.target.value)}
          className="absolute inset-0 h-full w-full cursor-default opacity-0"
          aria-label={t('pairing.inputLabel')}
          aria-invalid={error ? 'true' : 'false'}
        />
        <div className="grid grid-cols-6 gap-3" aria-hidden="true">
          {boxes.map((digit, i) => (
            <div
              key={i}
              className={`flex aspect-[3/4] items-center justify-center rounded-2xl border-2 bg-white text-[length:var(--pd-total)] font-bold leading-none tabular-nums text-neutral-900 ${
                i === digits.length && !busy ? 'border-neutral-900' : 'border-neutral-200'
              }`}
            >
              {digit}
            </div>
          ))}
        </div>
      </label>

      <p className="min-h-[1.5em] text-[length:var(--pd-line)]" aria-live="polite" style={{ color: errorText ? '#b91c1c' : '#525252' }}>
        {busy ? t('pairing.busy') : errorText ? (espera > 0 ? t('pairing.retryAfter', { seconds: espera }) : errorText) : ''}
      </p>

      {touch && (
        <div className="grid w-full max-w-[min(90vw,560px)] grid-cols-3 gap-3" data-pairing-keypad="true">
          {KEYPAD_KEYS.map((key, i) =>
            key === '' ? (
              <span key={`blank-${i}`} aria-hidden="true" />
            ) : (
              <button
                key={key}
                type="button"
                disabled={busy}
                onClick={() => press(key)}
                className="rounded-2xl border-2 border-neutral-200 bg-white py-[calc(var(--pd-gutter)*0.5)] text-[length:var(--pd-line)] font-semibold text-neutral-900 disabled:opacity-60"
                aria-label={key === '⌫' ? t('tip.deleteDigit') : key}
              >
                {key}
              </button>
            ),
          )}
        </div>
      )}

      {onCancel && (
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-full border-2 border-neutral-300 px-[var(--pd-gutter)] py-[calc(var(--pd-gutter)*0.3)] text-[length:calc(var(--pd-line)*0.8)] font-semibold text-neutral-700 disabled:opacity-60"
          style={{ borderColor: FALLBACK_BRAND_COLOR }}
        >
          {t('pairing.cancel')}
        </button>
      )}
    </div>
  );
}
