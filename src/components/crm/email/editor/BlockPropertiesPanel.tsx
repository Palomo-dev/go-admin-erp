'use client';

/**
 * Panel derecho del editor: propiedades del bloque seleccionado o, sin
 * selección, ajustes del documento (ancho, fondo, fuente, marca).
 */

import { Settings2 } from 'lucide-react';
import type { Block, BlockSettings } from '@/lib/services/crm/email/blocks';
import { BLOCK_LABELS } from '@/lib/services/crm/email/blocks';
import type { RenderContext } from '@/lib/services/crm/email/variables';
import { BlockPropsForm } from './blocks/BlockPropsForm';
import { ColorField, NumberField, SelectField, TextField } from './blocks/fields';
import { BLOCK_ICONS } from './BlockPalette';

interface Props {
  selected: Block | null;
  settings: BlockSettings;
  ctx: RenderContext | null;
  onChangeBlock: (props: Record<string, unknown>) => void;
  onChangeSettings: (patch: Partial<BlockSettings> | { brand: Partial<BlockSettings['brand']> }) => void;
  readOnly?: boolean;
}

const FONT_OPTIONS = [
  { value: 'Inter, Arial, sans-serif', label: 'Inter / Arial' },
  { value: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
  { value: 'Georgia, Times New Roman, serif', label: 'Georgia (serif)' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: 'Courier New, Courier, monospace', label: 'Courier (mono)' },
];

export function BlockPropertiesPanel({ selected, settings, ctx, onChangeBlock, onChangeSettings, readOnly }: Props) {
  if (selected) {
    const Icon = BLOCK_ICONS[selected.type];
    return (
      <div className="space-y-3" aria-label={`Propiedades del bloque ${BLOCK_LABELS[selected.type]}`}>
        <div className="flex items-center gap-2 border-b border-gray-200 pb-2 dark:border-gray-700">
          <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{BLOCK_LABELS[selected.type]}</h3>
        </div>
        <fieldset disabled={readOnly} className="space-y-3">
          <BlockPropsForm block={selected} ctx={ctx} onChange={onChangeBlock} />
        </fieldset>
      </div>
    );
  }

  const fontValue = FONT_OPTIONS.some((f) => f.value === settings.font) ? settings.font : FONT_OPTIONS[0].value;
  return (
    <div className="space-y-3" aria-label="Ajustes del documento">
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2 dark:border-gray-700">
        <Settings2 className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Diseño del correo</h3>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">Selecciona un bloque para editar su contenido.</p>
      <fieldset disabled={readOnly} className="space-y-3">
        <NumberField label="Ancho (px)" value={settings.width} onChange={(v) => onChangeSettings({ width: Math.max(320, Math.min(800, v || 600)) })} min={320} max={800} />
        <ColorField label="Color de fondo" value={settings.bg} onChange={(v) => onChangeSettings({ bg: v })} />
        <SelectField label="Fuente" value={fontValue} onChange={(v) => onChangeSettings({ font: v })} options={FONT_OPTIONS} />
        <ColorField label="Color de marca" value={settings.brand.primary_color} onChange={(v) => onChangeSettings({ brand: { primary_color: v } })} />
        <TextField label="Logo por defecto (URL)" value={settings.brand.logo_url} onChange={(v) => onChangeSettings({ brand: { logo_url: v } })} hint="Se usa en el bloque Encabezado si no tiene logo propio. Admite {{org.logo_url}}." />
      </fieldset>
    </div>
  );
}
