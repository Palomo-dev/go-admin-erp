'use client';

import type { ContentFieldDef } from '@/lib/services/websitePageBuilderService';
import type { ThemePalette, Viewport } from './types';
import TextField from './TextField';
import TextareaField from './TextareaField';
import RichTextField from './RichTextField';
import UrlField from './UrlField';
import ImageField from './ImageField';
import BooleanField from './BooleanField';
import NumberField from './NumberField';
import SelectField from './SelectField';
import RangeField from './RangeField';
import ColorField from './ColorField';
import IconField from './IconField';
import AlignmentField from './AlignmentField';
import SpacingField from './SpacingField';
import RepeaterField from './RepeaterField';
import EntityField from './EntityField';
import ResponsiveField from './ResponsiveField';

export interface FieldRendererProps {
  field: ContentFieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  themePalette?: ThemePalette;
  organizationId?: number;
  activeViewport?: Viewport;
}

/**
 * Renderizador único: un `switch` sobre `field.type` que sustituye el bloque
 * de 125 líneas de `EditorSidebar.tsx:416-541`.
 *
 * Para campos `responsive: true` envuelve el control en `ResponsiveField`.
 * Para `spacing` el valor es el objeto content completo (escribe múltiples keys).
 */
export default function FieldRenderer({
  field,
  value,
  onChange,
  themePalette,
  organizationId,
  activeViewport,
}: FieldRendererProps) {
  // Render del control base según el tipo.
  const renderBase = (v: unknown, onCh: (val: unknown) => void) => {
    switch (field.type) {
      case 'text':
        return <TextField field={field} value={v} onChange={onCh} />;
      case 'textarea':
        return <TextareaField field={field} value={v} onChange={onCh} />;
      case 'richtext':
        return <RichTextField field={field} value={v} onChange={onCh} />;
      case 'url':
        return <UrlField field={field} value={v} onChange={onCh} />;
      case 'image':
        return <ImageField field={field} value={v} onChange={onCh} />;
      case 'color':
        return <ColorField field={field} value={v} onChange={onCh} themePalette={themePalette} />;
      case 'boolean':
        return <BooleanField field={field} value={v} onChange={onCh} />;
      case 'number':
        return <NumberField field={field} value={v} onChange={onCh} />;
      case 'select':
        return <SelectField field={field} value={v} onChange={onCh} />;
      case 'range':
        return <RangeField field={field} value={v} onChange={onCh} />;
      case 'icon':
        return <IconField field={field} value={v} onChange={onCh} />;
      case 'alignment':
        return <AlignmentField field={field} value={v} onChange={onCh} />;
      case 'spacing':
        return <SpacingField field={field} value={v} onChange={onCh} />;
      case 'repeater':
        return (
          <RepeaterField
            field={field}
            value={v}
            onChange={onCh}
            themePalette={themePalette}
            organizationId={organizationId}
          />
        );
      case 'entity':
        return (
          <EntityField
            field={field}
            value={v}
            onChange={onCh}
            organizationId={organizationId}
          />
        );
      default:
        return null;
    }
  };

  // Campos responsive: envolver en tabs desktop/tablet/mobile.
  if (field.responsive && field.type !== 'spacing' && field.type !== 'repeater' && field.type !== 'entity') {
    return (
      <ResponsiveField
        field={field}
        value={value}
        onChange={onChange}
        activeViewport={activeViewport}
        renderControl={renderBase}
      />
    );
  }

  return <>{renderBase(value, onChange)}</>;
}
