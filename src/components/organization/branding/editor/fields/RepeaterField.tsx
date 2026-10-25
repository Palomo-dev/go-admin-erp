'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/utils/Utils';
import type { ContentFieldDef } from '@/lib/services/websitePageBuilderService';
import type { ThemePalette } from './types';
import FieldRenderer from './FieldRenderer';
import { useTranslations } from 'next-intl';

interface RepeaterFieldProps {
  field: ContentFieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  themePalette?: ThemePalette;
  organizationId?: number;
}

type RepeaterItem = Record<string, unknown> & { id?: string };

/**
 * Evalúa `showIf` de un itemField contra los valores del propio item.
 * Réplica mínima de `isFieldVisible` de EditorSidebar pero sin `variantIn`
 * (dentro de un repeater no hay variante de sección).
 */
function isItemFieldVisible(
  field: ContentFieldDef,
  item: RepeaterItem,
): boolean {
  const c = field.showIf;
  if (!c) return true;
  if (c.field) {
    const v = item?.[c.field];
    if (c.equals !== undefined && v !== c.equals) return false;
    if (c.in && !c.in.includes(v)) return false;
  }
  return true;
}

function idProvisional(id: string | undefined): boolean {
  return !id || id.startsWith('def-') || id.startsWith('tmp-');
}

/** Lo que se pinta. No es el valor guardado. */
export function materializarRepeater(items: RepeaterItem[], field: ContentFieldDef): RepeaterItem[] {
  if (items.length === 0 && field.defaultItems && field.defaultItems.length > 0) {
    return field.defaultItems.map((item, i) => ({
      ...item,
      id: `def-${field.key}-${i}`,
    }));
  }
  return items.map((item, i) => (item.id ? item : { ...item, id: `tmp-${field.key}-${i}` }));
}

/** Al editar, los ids de pantalla se cambian por uuid reales. */
export function persistirRepeater(lista: RepeaterItem[]): RepeaterItem[] {
  return lista.map((item) => (idProvisional(item.id) ? { ...item, id: crypto.randomUUID() } : item));
}

/**
 * Lista de items con agregar/duplicar/eliminar/reordenar (drag).
 * Cada item se expande y renderiza `itemFields` recursivamente vía
 * `FieldRenderer`. Reemplaza los 7 editores ad-hoc de EditorSidebar.
 *
 * Preserva el campo `id` de cada item para no romper el JSON guardado.
 */
export default function RepeaterField({
  field,
  value,
  onChange,
  themePalette,
  organizationId,
}: RepeaterFieldProps) {
  const t = useTranslations('branding.editor');
  const items = (Array.isArray(value) ? value : []) as RepeaterItem[];
  const itemFields = field.itemFields || [];
  const labelKey = field.itemLabelKey || itemFields[0]?.key;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Los valores por defecto y los ids que faltan se ven al instante, pero no
  // se escriben hasta que la persona edita. Escribir al montar marcaba la
  // sección como cambiada con solo abrir la pestaña, y las etiquetas pasaban
  // de «(0)» a «(3)» después del primer render.
  const visibles = materializarRepeater(items, field);

  const emitir = (lista: RepeaterItem[]) => {
    onChange(persistirRepeater(lista));
  };

  const buildEmptyItem = (): RepeaterItem => {
    const item: RepeaterItem = { id: crypto.randomUUID() };
    itemFields.forEach((f) => {
      if (f.defaultValue !== undefined) item[f.key] = f.defaultValue;
    });
    return item;
  };

  const handleAdd = () => {
    if (field.maxItems && visibles.length >= field.maxItems) return;
    const newItem = buildEmptyItem();
    emitir([...visibles, newItem]);
    setExpandedId(newItem.id!);
  };

  const handleDuplicate = (idx: number) => {
    if (field.maxItems && visibles.length >= field.maxItems) return;
    const copy = { ...visibles[idx], id: crypto.randomUUID() };
    const next = [...visibles];
    next.splice(idx + 1, 0, copy);
    emitir(next);
    setExpandedId(copy.id!);
  };

  const handleRemove = (idx: number) => {
    const next = visibles.filter((_, i) => i !== idx);
    emitir(next);
    if (expandedId === visibles[idx]?.id) setExpandedId(null);
  };

  const handleUpdateItem = (id: string, key: string, val: unknown) => {
    emitir(visibles.map((i) => ((i.id || '') === id ? { ...i, [key]: val } : i)));
  };

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIdx !== null && dragIdx !== idx) {
      const reordered = [...visibles];
      const [moved] = reordered.splice(dragIdx, 1);
      reordered.splice(idx, 0, moved);
      emitir(reordered);
      setDragIdx(idx);
    }
  };
  const handleDragEnd = () => setDragIdx(null);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-gray-500 dark:text-gray-400">
          {field.label} ({visibles.length})
        </Label>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
        >
          <Plus className="h-3 w-3" /> {t('sidebar.add')}
        </button>
      </div>

      {visibles.length > 0 ? (
        <div className="space-y-1.5">
          {visibles.map((item, idx) => {
            const itemId = item.id || `tmp-${idx}`;
            const isExpanded = expandedId === itemId;
            const labelVal = labelKey ? String(item[labelKey] || '') : '';
            return (
              <div
                key={itemId}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                className={cn(
                  'rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/5 overflow-hidden',
                  dragIdx === idx && 'opacity-50',
                )}
              >
                <div
                  className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5"
                  onClick={() => setExpandedId(isExpanded ? null : itemId)}
                >
                  <GripVertical className="h-3 w-3 text-gray-400 shrink-0 cursor-grab dark:text-gray-500" />
                  <span className="text-[11px] flex-1 min-w-0 break-words text-gray-700 dark:text-gray-300">
                    {labelVal || `${field.label} ${idx + 1}`}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDuplicate(idx); }}
                    className="p-0.5 hover:text-blue-500 text-gray-400 dark:hover:text-blue-400 dark:text-gray-500"
                    title={t('repeaterField.duplicar')}
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRemove(idx); }}
                    className="p-0.5 hover:text-red-500 text-gray-400 dark:hover:text-red-400 dark:text-gray-500"
                    title={t('repeaterField.eliminar')}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                  {isExpanded ? (
                    <ChevronUp className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                  )}
                </div>
                {isExpanded && (
                  <div className="px-2 pb-2 space-y-2 border-t border-gray-100 dark:border-gray-700/50">
                    {itemFields
                      .filter((f) => isItemFieldVisible(f, item))
                      .map((f) => (
                      <div key={f.key} className="space-y-1">
                        <Label className="text-[10px] text-gray-400 dark:text-gray-500">
                          {f.label}
                        </Label>
                        {f.type === 'image' && f.helpText ? (
                          <p className="text-[10px] leading-snug text-gray-500 dark:text-gray-400">{f.helpText}</p>
                        ) : null}
                        <FieldRenderer
                          field={f}
                          value={item[f.key]}
                          onChange={(v) => handleUpdateItem(itemId, f.key, v)}
                          themePalette={themePalette}
                          organizationId={organizationId}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center py-2">
          {t('repeaterField.sinElementosAgregaMenos')}
        </p>
      )}
    </div>
  );
}
