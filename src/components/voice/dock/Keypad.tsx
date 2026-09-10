'use client';

/**
 * Keypad — marcador (E.164 o local CO) y teclado DTMF (FASE-03 §5.2 DialPad).
 * Navegable con Tab; acepta teclado físico 0-9 * #.
 */

import { Delete, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils/Utils';

const DIAL_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

interface KeypadProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** En llamada: cada tecla envía DTMF en vez de editar el número. */
  dtmfMode?: boolean;
  onDigit?: (digit: string) => void;
  disabled?: boolean;
}

export function Keypad({ value, onChange, onSubmit, dtmfMode = false, onDigit, disabled }: KeypadProps) {
  const press = (key: string) => {
    if (dtmfMode) {
      onDigit?.(key);
      onChange(value + key);
      return;
    }
    onChange(value + key);
  };

  return (
    <div className="space-y-2" role="group" aria-label={dtmfMode ? 'Teclado DTMF' : 'Marcador'}>
      <div className="flex items-center gap-1">
        <Input
          type="tel"
          inputMode="tel"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d+*#\s-]/g, ''))}
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
          className="text-center font-mono text-lg"
          disabled={disabled}
          readOnly={dtmfMode}
        />
        {value && !dtmfMode && (
          <>
            <button
              type="button"
              onClick={() => onChange(value.slice(0, -1))}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
              aria-label="Borrar último dígito"
            >
              <Delete size={16} />
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
              aria-label="Limpiar número"
            >
              <X size={16} />
            </button>
          </>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {DIAL_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            disabled={disabled}
            aria-label={dtmfMode ? `Enviar ${key}` : `Tecla ${key}`}
            className={cn(
              'h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700',
              'text-lg font-mono font-semibold text-gray-900 dark:text-gray-100 transition-colors disabled:opacity-50',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
            )}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
}
