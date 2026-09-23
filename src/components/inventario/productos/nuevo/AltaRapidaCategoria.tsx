'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { Category } from '@/lib/services/categoryService';
import { QuickCategoryForm } from './QuickCategoryForm';

/**
 * Alta rápida de categoría desde el `SearchSelect` de categoría (Figma «Alta
 * rápida de categoría — completa», `520:61612`): la opción «Crear “…”» abre
 * esta hoja con el nombre ya escrito y, al guardar, quien la abrió deja la
 * categoría seleccionada.
 *
 * El formulario (`QuickCategoryForm`) ya trae su pie con «Cancelar» y «Crear
 * y seleccionar»: aquí solo va la cabecera del diálogo del manual, sin otro
 * panel alrededor (PARIDAD-ETIQUETAS-CATEGORIA §4, «omitido a propósito»).
 */
export interface AltaRapidaCategoriaProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  nombreInicial?: string;
  onCreada: (categoria: Category) => void;
}

export function AltaRapidaCategoria({ abierto, onAbiertoChange, nombreInicial, onCreada }: AltaRapidaCategoriaProps) {
  const t = useTranslations('inventarioEtiquetas.categoria');
  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent
        hideCloseButton
        className="flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-none flex-col gap-0 overflow-hidden rounded-xl border-line bg-surface p-0 text-fg sm:max-w-[560px] sm:rounded-xl"
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <DialogTitle className="text-lg font-semibold leading-6 text-fg">{t('titulo')}</DialogTitle>
            <DialogDescription className="text-sm leading-5 text-fg-secondary">{t('descripcion')}</DialogDescription>
          </div>
          <button
            type="button"
            aria-label={t('cerrar')}
            onClick={() => onAbiertoChange(false)}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X aria-hidden="true" className="size-5" strokeWidth={1.5} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {abierto && (
            <QuickCategoryForm
              // Un formulario nuevo por apertura: el nombre prellenado cambia.
              key={nombreInicial ?? ''}
              nombreInicial={nombreInicial}
              onSuccess={(categoria) => {
                onAbiertoChange(false);
                onCreada(categoria);
              }}
              onCancel={() => onAbiertoChange(false)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
