'use client';

/**
 * EntitySelect — selector visual para IDs de entidades del CRM.
 *
 * Reemplaza los inputs de texto donde el usuario tenía que pegar un UUID a mano.
 * Usa el componente Select de shadcn/ui y muestra el nombre legible de la entidad.
 * Si la lista está vacía, muestra un mensaje en vez de un selector vacío.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Option {
  id: string;
  name: string;
}

interface Props<T extends Option> {
  value: string | null;
  onChange: (id: string | null) => void;
  options: T[];
  placeholder: string;
  emptyMessage?: string;
  disabled?: boolean;
  ariaLabel?: string;
  /** Texto opcional junto al nombre (ej. el tipo de pipeline). */
  renderSubtitle?: (opt: T) => string | null;
}

const INHERIT = '__none__';

export function EntitySelect<T extends Option>({
  value,
  onChange,
  options,
  placeholder,
  emptyMessage,
  disabled,
  ariaLabel,
  renderSubtitle,
}: Props<T>) {
  if (options.length === 0 && emptyMessage) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400">{emptyMessage}</p>
    );
  }

  return (
    <Select
      value={value ?? INHERIT}
      disabled={disabled || options.length === 0}
      onValueChange={(v) => onChange(v === INHERIT ? null : v)}
    >
      <SelectTrigger aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={INHERIT}>{placeholder}</SelectItem>
        {options.map((opt) => {
          const subtitle = renderSubtitle ? renderSubtitle(opt) : null;
          return (
            <SelectItem key={opt.id} value={opt.id}>
              {opt.name}
              {subtitle ? ` · ${subtitle}` : ''}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
