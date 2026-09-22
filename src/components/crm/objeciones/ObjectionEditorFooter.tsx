'use client';

/**
 * Pie de la hoja de objeción (UX móvil, ronda 1). Una sola fila también a
 * 375 px: interruptor «Activa» a la izquierda, Cancelar y Guardar a la
 * derecha; si el texto no cabe, `flex-wrap` sube el interruptor a su propia
 * línea en vez de cortar los botones. `shrink-0` para que el cuerpo con scroll
 * nunca lo empuje fuera, y `env(safe-area-inset-bottom)` para el borde inferior
 * de iPhone (`viewport-fit=cover` está en el layout raíz).
 */

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SheetFooter } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';

interface Props {
  isActive: boolean;
  saving: boolean;
  /** `true` al editar una objeción existente; `false` al crear. */
  editing: boolean;
  onActiveChange: (active: boolean) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

/** Clases del pie: fijadas por `mobileLayout.test.ts`. */
export const FOOTER_CLASS =
  'flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 shrink-0 border-t ' +
  'border-gray-200 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] ' +
  'dark:border-gray-800 dark:bg-gray-900 sm:justify-between sm:px-6';

export function ObjectionEditorFooter({
  isActive,
  saving,
  editing,
  onActiveChange,
  onCancel,
  onSubmit,
}: Props) {
  return (
    <SheetFooter className={FOOTER_CLASS}>
      {/* El Label envuelve al interruptor con `min-h-11`: objetivo táctil ≥ 44 px (tester UXM-B:
          el `Switch` mide 36×20 y solo el texto ampliaba el ancho, no la altura). El navegador no
          reenvía el clic cuando el objetivo ya es el control: no conmuta dos veces. */}
      <Label
        htmlFor="objection-active"
        className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-gray-900 dark:text-gray-100"
      >
        <Switch
          id="objection-active"
          checked={isActive}
          disabled={saving}
          onCheckedChange={onActiveChange}
        />
        {isActive ? 'Activa' : 'Inactiva'}
      </Label>
      {/* `ml-auto`: si envuelve, los botones quedan a la derecha en su línea; `px-3` a 375 px
          para que «Inactiva · Cancelar · Guardar cambios» quepa en una sola. */}
      <div className="ml-auto flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="px-3 sm:px-4"
          disabled={saving}
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          className="bg-blue-600 px-3 text-white hover:bg-blue-700 sm:px-4"
          disabled={saving}
          onClick={onSubmit}
        >
          {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear objeción'}
        </Button>
      </div>
    </SheetFooter>
  );
}
