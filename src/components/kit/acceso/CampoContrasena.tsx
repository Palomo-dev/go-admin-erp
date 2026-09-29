'use client';

/**
 * Campo de contraseña del acceso (Figma `PasswordField` 351:137843): candado a
 * la izquierda, botón de ojo con nombre accesible, `autocomplete` correcto
 * (`current-password` al entrar, `new-password` al crear) y el mismo marco que
 * `FormField` (etiqueta, ayuda, error enlazados por `aria-describedby`).
 */
import * as React from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FormField } from '@/components/kit/FormField';
import { cn } from '@/utils/Utils';

export interface CampoContrasenaProps {
  etiqueta: string;
  valor: string;
  onValor: (v: string) => void;
  /** `nueva` = `autocomplete="new-password"`; `actual` = `current-password`. */
  modo: 'actual' | 'nueva';
  id?: string;
  name?: string;
  error?: string | null;
  ayuda?: React.ReactNode;
  obligatorio?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Contenido a la derecha de la etiqueta («¿Olvidaste tu contraseña?»). */
  extra?: React.ReactNode;
  /** Debajo del campo (el medidor de fortaleza). */
  debajo?: React.ReactNode;
}

export const CampoContrasena = React.forwardRef<HTMLInputElement, CampoContrasenaProps>(function CampoContrasena(
  { etiqueta, valor, onValor, modo, id, name, error, ayuda, obligatorio, placeholder, autoFocus, disabled, extra, debajo },
  ref,
) {
  const t = useTranslations('acceso.comun');
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="space-y-2">
      <FormField etiqueta={etiqueta} id={id} error={error} ayuda={ayuda} obligatorio={obligatorio} extra={extra}>
        {(campo) => (
          <div
            className={cn(
              'flex h-10 items-center rounded-lg border bg-surface transition-colors',
              'focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20',
              campo['aria-invalid'] ? 'border-danger' : 'border-line-strong',
              disabled && 'opacity-60',
            )}
          >
            <Lock className="ml-3 size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            <input
              ref={ref}
              id={campo.id}
              name={name ?? (modo === 'nueva' ? 'new-password' : 'password')}
              type={visible ? 'text' : 'password'}
              autoComplete={modo === 'nueva' ? 'new-password' : 'current-password'}
              value={valor}
              onChange={(e) => onValor(e.target.value)}
              placeholder={placeholder}
              autoFocus={autoFocus}
              disabled={disabled}
              required={obligatorio}
              aria-describedby={campo['aria-describedby']}
              aria-invalid={campo['aria-invalid']}
              aria-required={campo['aria-required']}
              className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? t('ocultarContrasena') : t('mostrarContrasena')}
              aria-pressed={visible}
              aria-controls={campo.id}
              className="mr-1 inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
            </button>
          </div>
        )}
      </FormField>
      {debajo}
    </div>
  );
});
