'use client';

/**
 * F9.3 — Panel de layout de página (page_settings).
 *
 * Permite editar la configuración de layout de la página de detalle:
 *  - `columns`: 1 / 2 / 2+sidebar
 *  - `gallery_width`: porcentaje de ancho de la galería (solo product_detail)
 *  - `sticky_column`: columna derecha pegajosa al hacer scroll
 *
 * Solo se muestra para page_type que soportan page_settings:
 * product_detail, category_detail.
 */

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PageLayoutPanelProps {
  pageType: string;
  pageSettings: Record<string, any> | null | undefined;
  onUpdate: (settings: Record<string, any>) => void;
}

const LAYOUT_TYPES = new Set(['product_detail', 'category_detail']);

export function PageLayoutPanel({ pageType, pageSettings, onUpdate }: PageLayoutPanelProps) {
  if (!LAYOUT_TYPES.has(pageType)) {
    return (
      <p className="text-xs text-gray-400 dark:text-gray-500 py-2">
        Este tipo de página no tiene configuración de layout.
      </p>
    );
  }

  const settings = pageSettings || {};
  const columns = settings.columns || '2';
  const galleryWidth = settings.gallery_width ?? 50;
  const stickyColumn = settings.sticky_column !== false;

  const isProductDetail = pageType === 'product_detail';

  return (
    <div className="space-y-4">
      {/* Columnas */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-500 dark:text-gray-400">Columnas</Label>
        <Select
          value={columns}
          onValueChange={(v) => onUpdate({ ...settings, columns: v })}
        >
          <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Una columna (ancho completo)</SelectItem>
            <SelectItem value="2">Dos columnas (galería + info)</SelectItem>
            <SelectItem value="2+sidebar">Dos columnas + sidebar</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[10px] text-gray-400 dark:text-gray-500">
          Controla la disposición principal de la página.
        </p>
      </div>

      {/* Ancho de galería (solo product_detail) */}
      {isProductDetail && (
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500 dark:text-gray-400">
            Ancho de galería: {galleryWidth}%
          </Label>
          <input
            type="range"
            min={30}
            max={70}
            step={5}
            value={galleryWidth}
            onChange={(e) => onUpdate({ ...settings, gallery_width: Number(e.target.value) })}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            Porcentaje del ancho que ocupa la galería de imágenes.
          </p>
        </div>
      )}

      {/* Columna sticky */}
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs text-gray-600 dark:text-gray-300">Columna pegajosa</Label>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            La columna de información se fija al hacer scroll.
          </p>
        </div>
        <button
          onClick={() => onUpdate({ ...settings, sticky_column: !stickyColumn })}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            stickyColumn ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
          }`}
          role="switch"
          aria-checked={stickyColumn}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              stickyColumn ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
