'use client';

/**
 * Campo para pegar una llave o secreto (llave privada, secreto de eventos, token…) con el botón de
 * ojo «Mostrar» / «Ocultar» para verificar lo escrito (pedido del dueño, 2026-11-07).
 *
 * No es `CampoContrasena` (kit/acceso): aquel es para la contraseña del usuario y pide al
 * navegador que la guarde (`current-password` / `new-password`). Aquí:
 *  - `autoComplete="off"`, `spellCheck={false}`, `autoCapitalize="off"`, `autoCorrect="off"` y
 *    `data-1p-ignore`/`data-lpignore`: ni el navegador ni los gestores lo guardan ni lo corrigen;
 *  - el botón tiene `aria-label`, `aria-pressed` y `aria-controls`; al pulsarlo con el ratón el foco
 *    y el cursor se quedan en el campo (no se pierde la posición de lo que se está escribiendo);
 *  - nada se precarga ni se registra: el valor solo vive en el estado de quien lo usa.
 *
 * Se usa como hijo de `FormField` (recibe `id` y `aria-*` por `cloneElement`).
 */
import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useKitTextos } from './useIdiomaKit';
import { cn } from '@/utils/Utils';

export interface CampoSecretoProps {
  valor: string;
  onValor: (v: string) => void;
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  /** Textos del botón (por defecto `kit.campoSecreto.*`). */
  textoMostrar?: string;
  textoOcultar?: string;
}

export const CampoSecreto = React.forwardRef<HTMLInputElement, CampoSecretoProps>(function CampoSecreto(
  { valor, onValor, id, name, placeholder, disabled, autoFocus, className, textoMostrar, textoOcultar, ...aria },
  ref,
) {
  const tx = useKitTextos();
  const generado = React.useId();
  const idCampo = id ?? `secreto-${generado}`;
  const [visible, setVisible] = React.useState(false);
  const entrada = React.useRef<HTMLInputElement | null>(null);
  const seleccion = React.useRef<{ inicio: number | null; fin: number | null; tieneFoco: boolean } | null>(null);

  React.useImperativeHandle(ref, () => entrada.current as HTMLInputElement);

  // Tras cambiar el tipo se devuelve el foco y la posición del cursor si el campo los tenía.
  React.useLayoutEffect(() => {
    const s = seleccion.current;
    const el = entrada.current;
    if (!s || !el || !s.tieneFoco) return;
    el.focus();
    if (s.inicio != null && s.fin != null) el.setSelectionRange(s.inicio, s.fin);
    seleccion.current = null;
  }, [visible]);

  const alternar = () => {
    const el = entrada.current;
    seleccion.current = {
      inicio: el?.selectionStart ?? null,
      fin: el?.selectionEnd ?? null,
      tieneFoco: !!el && typeof document !== 'undefined' && document.activeElement === el,
    };
    setVisible((v) => !v);
  };

  const mostrar = textoMostrar ?? tx('campoSecreto.mostrar', 'Mostrar');
  const ocultar = textoOcultar ?? tx('campoSecreto.ocultar', 'Ocultar');

  return (
    <div
      className={cn(
        'flex h-10 w-full items-center rounded-lg border border-line-strong bg-surface transition-colors',
        'focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30',
        aria['aria-invalid'] && 'border-danger',
        disabled && 'opacity-60',
        className,
      )}
    >
      <input
        ref={entrada}
        id={idCampo}
        name={name}
        type={visible ? 'text' : 'password'}
        value={valor}
        onChange={(e) => onValor(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-1p-ignore=""
        data-lpignore="true"
        {...aria}
        className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-sm text-fg placeholder:text-fg-tertiary focus:outline-none"
      />
      <button
        type="button"
        // El ratón no le quita el foco al campo: se puede seguir escribiendo donde iba el cursor.
        onMouseDown={(e) => e.preventDefault()}
        onClick={alternar}
        disabled={disabled}
        aria-label={visible ? ocultar : mostrar}
        aria-pressed={visible}
        aria-controls={idCampo}
        title={visible ? ocultar : mostrar}
        className="mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed"
      >
        {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
      </button>
    </div>
  );
});
