'use client';

import { useEffect, useRef, useState } from 'react';
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
  const items = (Array.isArray(value) ? value : []) as RepeaterItem[];
  const itemFields = field.itemFields || [];
  const labelKey = field.itemLabelKey || itemFields[0]?.key;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const didNormalize = useRef(false);
  const didInitDefaults = useRef(false);

  // Pre-poblar con defaultItems cuando el array está vacío (una sola vez).
  // Esto hace que el editor muestre los botones/badges por defecto en lugar
  // de "Sin elementos", pero el usuario puede eliminarlos si no los quiere.
  useEffect(() => {
    if (didInitDefaults.current) return;
    if (items.length === 0 && field.defaultItems && field.defaultItems.length > 0) {
      didInitDefaults.current = true;
      const defaults = field.defaultItems.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
      }));
      onChange(defaults);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Normalizar ids una sola vez (retrocompatibilidad con items sin id).
  useEffect(() => {
    if (didNormalize.current) return;
    const needsIds = items.some((i) => !i.id);
    if (needsIds && items.length > 0) {
      didNormalize.current = true;
      onChange(items.map((i) => (i.id ? i : { ...i, id: crypto.randomUUID() })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildEmptyItem = (): RepeaterItem => {
    const item: RepeaterItem = { id: crypto.randomUUID() };
    itemFields.forEach((f) => {
      if (f.defaultValue !== undefined) item[f.key] = f.defaultValue;
    });
    return item;
  };

  const handleAdd = () => {
    if (field.maxItems && items.length >= field.maxItems) return;
    const newItem = buildEmptyItem();
    onChange([...items, newItem]);
    setExpandedId(newItem.id!);
  };

  const handleDuplicate = (idx: number) => {
    if (field.maxItems && items.length >= field.maxItems) return;
    const copy = { ...items[idx], id: crypto.randomUUID() };
    const next = [...items];
    next.splice(idx + 1, 0, copy);
    onChange(next);
    setExpandedId(copy.id!);
  };

  const handleRemove = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    onChange(next);
    if (expandedId === items[idx]?.id) setExpandedId(null);
  };

  const handleUpdateItem = (id: string, key: string, val: unknown) => {
    onChange(items.map((i) => (i.id === id ? { ...i, [key]: val } : i)));
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
      const reordered = [...items];
      const [moved] = reordered.splice(dragIdx, 1);
      reordered.splice(idx, 0, moved);
      onChange(reordered);
      setDragIdx(idx);
    }
  };
  const handleDragEnd = () => setDragIdx(null);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-gray-500 dark:text-gray-400">
          {field.label} ({items.length})
        </Label>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
        >
          <Plus className="h-3 w-3" /> Agregar
        </button>
      </div>

      {items.length > 0 ? (
        <div className="space-y-1.5">
          {items.map((item, idx) => {
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
                    title="Duplicar"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRemove(idx); }}
                    className="p-0.5 hover:text-red-500 text-gray-400 dark:hover:text-red-400 dark:text-gray-500"
                    title="Eliminar"
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
          Sin elementos. Agrega al menos uno.
        </p>
      )}
    </div>
  );
}
