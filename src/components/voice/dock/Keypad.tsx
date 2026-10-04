'use client';

/**
 * Keypad — marcador (E.164 o local CO) y teclado DTMF (FASE-03 §5.2 DialPad).
 * Navegable con Tab; acepta teclado físico 0-9 * #.
 *
 * Multi-tap T9: mantener oprimido >500ms inserta la primera letra de la tecla.
 * Si se sigue presionando rápido (<1.5s entre taps), cicla entre las letras.
 * Después de 1.5s sin presionar, se confirma el carácter y se puede escribir el siguiente.
 */

import { useRef, useCallback, useEffect, type ReactNode } from 'react';
import { Delete, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils/Utils';
import { useTranslations } from 'next-intl';

const DIAL_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

// Letras bajo cada tecla (como un teléfono real)
const KEY_LETTERS: Record<string, string> = {
  '1': '', '2': 'ABC', '3': 'DEF',
  '4': 'GHI', '5': 'JKL', '6': 'MNO',
  '7': 'PQRS', '8': 'TUV', '9': 'WXYZ',
  '*': '', '0': '+', '#': '',
};

// Caracteres que se insertan al mantener oprimido (multi-tap T9)
const KEY_CHARS: Record<string, string[]> = {
  '1': ['1'],
  '2': ['2', 'A', 'B', 'C'],
  '3': ['3', 'D', 'E', 'F'],
  '4': ['4', 'G', 'H', 'I'],
  '5': ['5', 'J', 'K', 'L'],
  '6': ['6', 'M', 'N', 'O'],
  '7': ['7', 'P', 'Q', 'R', 'S'],
  '8': ['8', 'T', 'U', 'V'],
  '9': ['9', 'W', 'X', 'Y', 'Z'],
  '*': ['*'],
  '0': ['0', '+', ' '],
  '#': ['#'],
};

const LONG_PRESS_MS = 500;
const CYCLE_TIMEOUT_MS = 1500;

interface KeypadProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** En llamada: cada tecla envía DTMF en vez de editar el número. */
  dtmfMode?: boolean;
  onDigit?: (digit: string) => void;
  disabled?: boolean;
  diseno?: 'heredado' | 'kit';
  despuesNumero?: ReactNode;
}

export function Keypad({ value, onChange, onSubmit, dtmfMode = false, onDigit, disabled, diseno = 'heredado', despuesNumero }: KeypadProps) {
  const t = useTranslations('phoneBrowser');
  // Estado del multi-tap T9
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cycleIndexRef = useRef(0);
  const activeKeyRef = useRef<string | null>(null);
  const isLongPressRef = useRef(false);
  const consumedMouseClick = useRef(false);

  const press = useCallback((key: string) => {
    if (dtmfMode) {
      onDigit?.(key);
      onChange(value + key);
      return;
    }
    onChange(value + key);
  }, [dtmfMode, onDigit, onChange, value]);

  const clearTimers = useCallback(() => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    if (cycleTimerRef.current) {
      clearTimeout(cycleTimerRef.current);
      cycleTimerRef.current = null;
    }
  }, []);

  // Confirmar el carácter actual del ciclo y resetear
  const confirmCycle = useCallback(() => {
    cycleIndexRef.current = 0;
    activeKeyRef.current = null;
    cycleTimerRef.current = null;
  }, []);

  // Iniciar el ciclo T9: reemplazar el último carácter con el siguiente del ciclo
  const advanceCycle = useCallback((key: string) => {
    const chars = KEY_CHARS[key];
    if (!chars || chars.length <= 1) return;

    cycleIndexRef.current = (cycleIndexRef.current + 1) % chars.length;
    const char = chars[cycleIndexRef.current];

    onChange(value.slice(0, -1) + char);

    // Resetear el ciclo después de un tiempo de inactividad
    if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
    cycleTimerRef.current = setTimeout(confirmCycle, CYCLE_TIMEOUT_MS);
  }, [value, onChange, confirmCycle]);

  // Manejo de presión en tecla (mouse y touch)
  const handlePressStart = useCallback((key: string) => {
    if (disabled || dtmfMode) return;
    consumedMouseClick.current = false;

    activeKeyRef.current = key;
    isLongPressRef.current = false;

    // Si ya hay un ciclo activo para esta misma tecla, avanzar el ciclo
    if (cycleTimerRef.current && activeKeyRef.current === key) {
      advanceCycle(key);
      return;
    }

    // Iniciar timer de long-press
    pressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      const chars = KEY_CHARS[key];
      if (chars && chars.length > 1) {
        // Long-press: insertar el primer carácter del ciclo (la letra)
        cycleIndexRef.current = 1; // Empezar en la primera letra (index 1, después del dígito)
        const char = chars[1];
        onChange(value + char);
        // Iniciar timer de confirmación
        cycleTimerRef.current = setTimeout(confirmCycle, CYCLE_TIMEOUT_MS);
      } else {
        // Para teclas sin letras (1, *, #), long-press = insertar el dígito normal
        onChange(value + key);
      }
    }, LONG_PRESS_MS);
  }, [disabled, dtmfMode, value, onChange, advanceCycle, confirmCycle]);

  const handlePressEnd = useCallback(() => {
    if (disabled || dtmfMode) return;

    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }

    // Si no fue long-press, es un tap normal → insertar el dígito
    if (!isLongPressRef.current && activeKeyRef.current) {
      const key = activeKeyRef.current;

      // Si hay un ciclo activo para esta tecla, no hacer nada (el tap ya avanzó el ciclo)
      if (cycleTimerRef.current && activeKeyRef.current === key) {
        // El ciclo ya está avanzando, no hacer nada
      } else {
        // Tap normal: insertar el dígito
        onChange(value + key);
      }
    }

    activeKeyRef.current = null;
    isLongPressRef.current = false;
  }, [disabled, dtmfMode, value, onChange]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  return (
    <div className={cn(diseno === 'kit' ? 'space-y-3' : 'space-y-2')} role="group" aria-label={dtmfMode ? 'Teclado DTMF' : 'Marcador'}>
      <div className={cn('flex items-center gap-1', diseno === 'kit' && 'relative rounded-[10px] border border-line-strong bg-surface focus-within:border-brand focus-within:ring-1 focus-within:ring-brand')}>
        {diseno === 'kit' && dtmfMode && <span className="absolute left-3 top-1 text-[10px] leading-3 text-fg-secondary">{t('sentTones')}</span>}
        <Input
          type="tel"
          inputMode="tel"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d+*#\s-a-zA-Z]/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !dtmfMode) {
              e.preventDefault();
              onSubmit();
            } else if (dtmfMode && /^[0-9*#]$/.test(e.key)) {
              e.preventDefault();
              press(e.key);
            }
          }}
          placeholder={dtmfMode ? 'Dígitos enviados' : '+57 300 123 4567'}
          aria-label={dtmfMode ? 'Dígitos DTMF' : 'Número a llamar'}
          className={cn('text-center font-mono text-lg', diseno === 'kit' && 'h-[52px] border-0 bg-transparent pl-3.5 pr-10 text-left font-sans text-xl font-medium leading-7 shadow-none focus-visible:ring-0', diseno === 'kit' && dtmfMode && 'h-12 rounded-lg bg-subtle pt-3')}
          disabled={disabled}
          readOnly={dtmfMode}
        />
        {value && (!dtmfMode || diseno === 'kit') && (
          <>
            <button
              type="button"
              hidden={diseno === 'kit' || dtmfMode}
              onClick={() => onChange(value.slice(0, -1))}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
              aria-label="Borrar último dígito"
            >
              <Delete size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                clearTimers();
                onChange('');
              }}
              className={cn('p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400', diseno === 'kit' && 'absolute right-2 flex size-8 items-center justify-center rounded-lg text-fg-secondary')}
              aria-label="Limpiar número"
            >
              <X size={16} />
            </button>
          </>
        )}
      </div>
      {despuesNumero}
      <div className={cn('grid grid-cols-3', diseno === 'kit' ? 'gap-2' : 'gap-1.5')}>
        {DIAL_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            // Tap normal (mouse)
            onClick={() => {
              if (consumedMouseClick.current) { consumedMouseClick.current = false; return; }
              // El click se maneja con mousedown/mouseup para detectar long-press.
              // Pero si es un click rápido (sin mousedown detectado), manejarlo aquí.
              if (!disabled && !dtmfMode && !isLongPressRef.current) {
                // Si hay ciclo activo para esta tecla, avanzar
                if (cycleTimerRef.current && activeKeyRef.current === key) {
                  advanceCycle(key);
                } else if (!pressTimerRef.current) {
                  // Tap normal
                  press(key);
                }
              } else if (dtmfMode) {
                press(key);
              }
            }}
            // Long-press detection (mouse)
            onMouseDown={(e) => {
              e.preventDefault();
              handlePressStart(key);
            }}
            onMouseUp={(e) => {
              e.preventDefault();
              handlePressEnd();
              if (!disabled && !dtmfMode) consumedMouseClick.current = true;
            }}
            onMouseLeave={() => {
              if (pressTimerRef.current) {
                clearTimeout(pressTimerRef.current);
                pressTimerRef.current = null;
              }
              isLongPressRef.current = false;
              activeKeyRef.current = null;
            }}
            // Long-press detection (touch)
            onTouchStart={(e) => {
              e.preventDefault();
              if (dtmfMode) activeKeyRef.current = key;
              handlePressStart(key);
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              if (dtmfMode && !disabled && activeKeyRef.current === key) { press(key); activeKeyRef.current = null; }
              handlePressEnd();
            }}
            onTouchCancel={() => {
              clearTimers();
              isLongPressRef.current = false;
              activeKeyRef.current = null;
            }}
            disabled={disabled}
            aria-label={dtmfMode ? `Enviar ${key}` : `Tecla ${key}${KEY_LETTERS[key] ? ` (${KEY_LETTERS[key]})` : ''}`}
            className={cn(
              'relative h-12 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700',
              'text-lg font-mono font-semibold text-gray-900 dark:text-gray-100 transition-colors disabled:opacity-50',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 select-none touch-manipulation',
              diseno === 'kit' && 'flex h-[52px] flex-col items-center justify-center rounded-xl border-0 bg-subtle font-sans text-[22px] leading-7 tracking-[-0.2px] text-fg hover:bg-hover active:bg-brand-tint dark:bg-subtle dark:text-fg dark:hover:bg-hover'
            )}
          >
            {key}
            {KEY_LETTERS[key] && (
              <span className={cn('absolute bottom-0.5 left-0 right-0 text-[8px] font-sans font-normal text-gray-400 dark:text-gray-500 leading-none', diseno === 'kit' && 'static text-xs font-medium leading-4 text-fg-secondary dark:text-fg-secondary')}>
                {KEY_LETTERS[key]}
              </span>
            )}
          </button>
        ))}
      </div>
      {/* Botón + para marcado internacional (E.164) */}
      {!dtmfMode && diseno !== 'kit' && (
        <button
          type="button"
          onClick={() => press('+')}
          disabled={disabled}
          aria-label="Insertar símbolo más"
          className="h-10 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 text-lg font-mono font-semibold text-gray-900 dark:text-gray-100 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          +
        </button>
      )}
    </div>
  );
}

export default Keypad;
