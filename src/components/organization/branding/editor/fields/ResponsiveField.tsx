'use client';

import { Monitor, Tablet, Smartphone } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ContentFieldDef } from '@/lib/services/websitePageBuilderService';
import type { Viewport } from './types';

export type { Viewport };

interface ResponsiveFieldProps {
  field: ContentFieldDef;
  /** Valor que puede ser escalar (legacy) o `{ desktop, tablet, mobile }`. */
  value: unknown;
  onChange: (value: unknown) => void;
  /** Viewport activo del preview (para sincronizar). */
  activeViewport?: Viewport;
  /** Render del control interno para un viewport dado. */
  renderControl: (value: unknown, onChange: (v: unknown) => void) => React.ReactNode;
}

/**
 * Envoltorio con 3 tabs (escritorio/tablet/móvil) alrededor de cualquier
 * control. Sincroniza con el viewport activo del preview.
 */
export default function ResponsiveField({
  field,
  value,
  onChange,
  activeViewport = 'desktop',
  renderControl,
}: ResponsiveFieldProps) {
  const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const isResponsive = obj && 'desktop' in obj;

  const getViewportValue = (vp: Viewport): unknown => {
    if (isResponsive) return obj[vp];
    // Valor escalar legacy → se aplica a todos los viewports.
    return value;
  };

  const setViewportValue = (vp: Viewport, v: unknown) => {
    if (isResponsive) {
      onChange({ ...obj, [vp]: v });
    } else {
      // Al editar un viewport, se promueve a objeto responsive.
      onChange({ desktop: value, tablet: value, mobile: value, [vp]: v });
    }
  };

  return (
    <Tabs defaultValue={activeViewport} className="w-full">
      <TabsList className="grid w-full grid-cols-3 h-7">
        <TabsTrigger value="desktop" className="text-[10px] py-0">
          <Monitor className="h-3 w-3 mr-1" /> Esc
        </TabsTrigger>
        <TabsTrigger value="tablet" className="text-[10px] py-0">
          <Tablet className="h-3 w-3 mr-1" /> Tab
        </TabsTrigger>
        <TabsTrigger value="mobile" className="text-[10px] py-0">
          <Smartphone className="h-3 w-3 mr-1" /> Móv
        </TabsTrigger>
      </TabsList>
      {(['desktop', 'tablet', 'mobile'] as Viewport[]).map((vp) => (
        <TabsContent key={vp} value={vp} className="mt-2">
          {renderControl(getViewportValue(vp), (v) => setViewportValue(vp, v))}
        </TabsContent>
      ))}
    </Tabs>
  );
}
