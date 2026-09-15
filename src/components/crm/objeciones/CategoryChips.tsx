'use client';

/**
 * Grupo de chips de categoría del editor de objeciones. Es un `fieldset` con
 * radios reales (una sola elección, obligatoria): el lector anuncia «botón de
 * opción, 2 de 8, seleccionado», Tab entra una vez y las flechas recorren;
 * por eso NO son botones con `aria-pressed` (ese patrón es el de los filtros
 * de la barra, que se apagan). El error de validación viaja por
 * `aria-describedby` del `fieldset` y el primer radio recibe el foco.
 */

import { OBJECTION_CATEGORIES } from '@/lib/services/crm/objectionModel';
import { cn } from '@/utils/Utils';
import { CategoryIcon } from './categoryMeta';

interface Props {
  /** Valor de la categoría elegida ('' si ninguna). */
  value: string;
  onChange: (value: string) => void;
  /** Mensaje de validación (vacío si no hay). */
  error?: string;
}

/** Id del radio de una categoría: el editor lo usa para enfocar el primero al fallar la validación. */
export const categoryChipId = (value: string) => `objection-category-${value}`;

export function CategoryChips({ value, onChange, error }: Props) {
  return (
    <fieldset
      aria-describedby={error ? 'objection-category-error' : undefined}
      aria-invalid={!!error}
    >
      <legend className="mb-1.5 text-xs text-gray-700 dark:text-gray-300">Categoría</legend>
      <div className="flex flex-wrap gap-1.5">
        {OBJECTION_CATEGORIES.map((c) => {
          const id = categoryChipId(c.value);
          const on = value === c.value;
          return (
            <div key={c.value}>
              <input
                id={id}
                type="radio"
                name="objection-category"
                value={c.value}
                checked={on}
                className="peer sr-only"
                onChange={() => onChange(c.value)}
              />
              <label
                htmlFor={id}
                className={cn(
                  'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium hover:transition-colors',
                  'peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2 dark:peer-focus-visible:ring-offset-gray-950',
                  on
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800',
                )}
              >
                <CategoryIcon value={c.value} />
                {c.label}
              </label>
            </div>
          );
        })}
      </div>
      {error && (
        <p
          id="objection-category-error"
          role="alert"
          className="mt-1 text-xs text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}
    </fieldset>
  );
}
