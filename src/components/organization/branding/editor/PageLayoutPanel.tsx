'use client';

/**
 * F9.3 — Panel de layout de página (page_settings).
 *
 * Permite editar la configuración de layout de la página de detalle:
 *  - `columns`: 1 / 2 / 2+sidebar
 *  - `gallery_width`: porcentaje de ancho de la galería (solo product_detail)
 *  - `sticky_column`: columna derecha pegajosa al hacer scroll
 *  - `gallery_layout`: carousel / scroll / grid / show_all
 *  - `thumbnails_position`: bottom / left / right / none
 *  - `gallery_arrows`: mostrar flechas en carousel
 *  - `gallery_dots`: mostrar dots en carousel
 *  - `gallery_grid_columns`: columnas en modo grid
 *  - `gallery_scroll_height`: altura máxima en modo scroll
 *  - `description_position`: below_title / below_price / below_buttons / above_gallery
 *  - `buttons_layout`: stacked / inline / split
 *  - `show_benefits`: mostrar bloque de beneficios
 *  - `show_breadcrumb`: mostrar breadcrumb
 *  - `related_products_layout`: carousel / grid
 *
 * Solo se muestra para page_type que soportan page_settings:
 * product_detail, category_detail.
 */

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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

  // Galería
  const galleryLayout = settings.gallery_layout || 'carousel';
  const thumbsPos = settings.thumbnails_position ?? 'bottom';
  const showArrows = settings.gallery_arrows !== false;
  const showDots = settings.gallery_dots !== false;
  const gridCols = settings.gallery_grid_columns ?? 3;
  const scrollHeight = settings.gallery_scroll_height ?? 500;

  // Descripción
  const descPos = settings.description_position || 'below_title';

  // Botones
  const buttonsLayout = settings.buttons_layout || 'stacked';

  // Beneficios y breadcrumb
  const showBenefits = settings.show_benefits !== false;
  const showBreadcrumb = settings.show_breadcrumb !== false;

  // Relacionados
  const relatedLayout = settings.related_products_layout || 'carousel';

  const update = (key: string, value: any) => onUpdate({ ...settings, [key]: value });

  return (
    <div className="space-y-4">
      {/* ===== Layout general ===== */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-500 dark:text-gray-400">Columnas</Label>
        <Select
          value={columns}
          onValueChange={(v) => update('columns', v)}
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
            onChange={(e) => update('gallery_width', Number(e.target.value))}
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
        <Switch checked={stickyColumn} onCheckedChange={(v) => update('sticky_column', v)} />
      </div>

      {/* ===== Galería de imágenes ===== */}
      {isProductDetail && (
        <>
          <div className="pt-2 border-t border-gray-100 dark:border-gray-700/50">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Galería de imágenes</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 dark:text-gray-400">Modo de galería</Label>
            <Select value={galleryLayout} onValueChange={(v) => update('gallery_layout', v)}>
              <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="carousel">Carrusel (flechas + dots)</SelectItem>
                <SelectItem value="scroll">Scroll vertical</SelectItem>
                <SelectItem value="grid">Grilla de imágenes</SelectItem>
                <SelectItem value="show_all">Todas visibles (columna)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 dark:text-gray-400">Posición de thumbnails</Label>
            <Select value={thumbsPos} onValueChange={(v) => update('thumbnails_position', v)}>
              <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bottom">Abajo (horizontal)</SelectItem>
                <SelectItem value="left">Izquierda (vertical)</SelectItem>
                <SelectItem value="right">Derecha (vertical)</SelectItem>
                <SelectItem value="none">Sin thumbnails</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {galleryLayout === 'carousel' && (
            <>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-600 dark:text-gray-300">Mostrar flechas</Label>
                <Switch checked={showArrows} onCheckedChange={(v) => update('gallery_arrows', v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-600 dark:text-gray-300">Mostrar indicadores (dots)</Label>
                <Switch checked={showDots} onCheckedChange={(v) => update('gallery_dots', v)} />
              </div>
            </>
          )}

          {galleryLayout === 'grid' && (
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 dark:text-gray-400">Columnas de grilla</Label>
              <Select value={String(gridCols)} onValueChange={(v) => update('gallery_grid_columns', Number(v))}>
                <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2 columnas</SelectItem>
                  <SelectItem value="3">3 columnas</SelectItem>
                  <SelectItem value="4">4 columnas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {galleryLayout === 'scroll' && (
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 dark:text-gray-400">
                Altura máxima de scroll: {scrollHeight}px
              </Label>
              <input
                type="range"
                min={300}
                max={800}
                step={50}
                value={scrollHeight}
                onChange={(e) => update('gallery_scroll_height', Number(e.target.value))}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          )}
        </>
      )}

      {/* ===== Descripción ===== */}
      {isProductDetail && (
        <>
          <div className="pt-2 border-t border-gray-100 dark:border-gray-700/50">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Descripción</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 dark:text-gray-400">Ubicación de la descripción</Label>
            <Select value={descPos} onValueChange={(v) => update('description_position', v)}>
              <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="below_title">Debajo del título</SelectItem>
                <SelectItem value="below_price">Debajo del precio</SelectItem>
                <SelectItem value="below_buttons">Debajo de los botones</SelectItem>
                <SelectItem value="above_gallery">Arriba de la galería</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {/* ===== Botones ===== */}
      {isProductDetail && (
        <>
          <div className="pt-2 border-t border-gray-100 dark:border-gray-700/50">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Botones de acción</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 dark:text-gray-400">Disposición de botones</Label>
            <Select value={buttonsLayout} onValueChange={(v) => update('buttons_layout', v)}>
              <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stacked">Apilados (vertical)</SelectItem>
                <SelectItem value="inline">En línea (horizontal)</SelectItem>
                <SelectItem value="split">Separados (uno arriba, uno abajo)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {/* ===== Elementos opcionales ===== */}
      {isProductDetail && (
        <>
          <div className="pt-2 border-t border-gray-100 dark:border-gray-700/50">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Elementos opcionales</p>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-600 dark:text-gray-300">Mostrar beneficios</Label>
            <Switch checked={showBenefits} onCheckedChange={(v) => update('show_benefits', v)} />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-600 dark:text-gray-300">Mostrar breadcrumb</Label>
            <Switch checked={showBreadcrumb} onCheckedChange={(v) => update('show_breadcrumb', v)} />
          </div>
        </>
      )}

      {/* ===== Productos relacionados ===== */}
      {isProductDetail && (
        <>
          <div className="pt-2 border-t border-gray-100 dark:border-gray-700/50">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Productos relacionados</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 dark:text-gray-400">Disposición de relacionados</Label>
            <Select value={relatedLayout} onValueChange={(v) => update('related_products_layout', v)}>
              <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="carousel">Carrusel horizontal</SelectItem>
                <SelectItem value="grid">Grilla responsiva</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    </div>
  );
}
