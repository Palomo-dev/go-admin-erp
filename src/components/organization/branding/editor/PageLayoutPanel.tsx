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
import { useTranslations } from 'next-intl';

interface PageLayoutPanelProps {
  pageType: string;
  pageSettings: Record<string, any> | null | undefined;
  onUpdate: (settings: Record<string, any>) => void;
}

const LAYOUT_TYPES = new Set(['product_detail', 'category_detail']);

export function PageLayoutPanel({ pageType, pageSettings, onUpdate }: PageLayoutPanelProps) {
  const t = useTranslations('branding.editor');
  if (!LAYOUT_TYPES.has(pageType)) {
    return (
      <p className="text-xs text-gray-400 dark:text-gray-500 py-2">
        {t('pageLayoutPanel.esteTipoPaginaNo')}
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
        <Label className="text-xs text-gray-500 dark:text-gray-400">{t('pageLayoutPanel.columnas')}</Label>
        <Select
          value={columns}
          onValueChange={(v) => update('columns', v)}
        >
          <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">{t('pageLayoutPanel.columnaAnchoCompleto')}</SelectItem>
            <SelectItem value="2">{t('pageLayoutPanel.dosColumnasGaleriaInfo')}</SelectItem>
            <SelectItem value="2+sidebar">{t('pageLayoutPanel.dosColumnasSidebar')}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[10px] text-gray-400 dark:text-gray-500">
          {t('pageLayoutPanel.controlaDisposicionPrincipalPagina')}
        </p>
      </div>

      {/* Ancho de galería (solo product_detail) */}
      {isProductDetail && (
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500 dark:text-gray-400">
            {t('pageLayoutPanel.anchoGaleria', { galleryWidth })}
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
            {t('pageLayoutPanel.porcentajeAnchoOcupaGaleria')}
          </p>
        </div>
      )}

      {/* Columna sticky */}
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs text-gray-600 dark:text-gray-300">{t('pageLayoutPanel.columnaPegajosa')}</Label>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            {t('pageLayoutPanel.columnaInformacionFijaHacer')}
          </p>
        </div>
        <Switch checked={stickyColumn} onCheckedChange={(v) => update('sticky_column', v)} />
      </div>

      {/* ===== Galería de imágenes ===== */}
      {isProductDetail && (
        <>
          <div className="pt-2 border-t border-gray-100 dark:border-gray-700/50">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">{t('pageLayoutPanel.galeriaImagenes')}</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 dark:text-gray-400">{t('pageLayoutPanel.modoGaleria')}</Label>
            <Select value={galleryLayout} onValueChange={(v) => update('gallery_layout', v)}>
              <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="carousel">{t('pageLayoutPanel.carruselFlechasDots')}</SelectItem>
                <SelectItem value="scroll">{t('pageLayoutPanel.scrollVertical')}</SelectItem>
                <SelectItem value="grid">{t('pageLayoutPanel.grillaImagenes')}</SelectItem>
                <SelectItem value="show_all">{t('pageLayoutPanel.todasVisiblesColumna')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 dark:text-gray-400">{t('pageLayoutPanel.posicionThumbnails')}</Label>
            <Select value={thumbsPos} onValueChange={(v) => update('thumbnails_position', v)}>
              <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bottom">{t('pageLayoutPanel.abajoHorizontal')}</SelectItem>
                <SelectItem value="left">{t('pageLayoutPanel.izquierdaVertical')}</SelectItem>
                <SelectItem value="right">{t('pageLayoutPanel.derechaVertical')}</SelectItem>
                <SelectItem value="none">{t('pageLayoutPanel.sinThumbnails')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {galleryLayout === 'carousel' && (
            <>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-600 dark:text-gray-300">{t('pageLayoutPanel.mostrarFlechas')}</Label>
                <Switch checked={showArrows} onCheckedChange={(v) => update('gallery_arrows', v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-600 dark:text-gray-300">{t('pageLayoutPanel.mostrarIndicadoresDots')}</Label>
                <Switch checked={showDots} onCheckedChange={(v) => update('gallery_dots', v)} />
              </div>
            </>
          )}

          {galleryLayout === 'grid' && (
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 dark:text-gray-400">{t('pageLayoutPanel.columnasGrilla')}</Label>
              <Select value={String(gridCols)} onValueChange={(v) => update('gallery_grid_columns', Number(v))}>
                <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">{t('pageLayoutPanel.n2Columnas')}</SelectItem>
                  <SelectItem value="3">{t('pageLayoutPanel.n3Columnas')}</SelectItem>
                  <SelectItem value="4">{t('pageLayoutPanel.n4Columnas')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {galleryLayout === 'scroll' && (
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 dark:text-gray-400">
                {t('pageLayoutPanel.alturaMaximaScrollPx', { scrollHeight })}
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
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">{t('pageLayoutPanel.descripcion')}</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 dark:text-gray-400">{t('pageLayoutPanel.ubicacionDescripcion')}</Label>
            <Select value={descPos} onValueChange={(v) => update('description_position', v)}>
              <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="below_title">{t('pageLayoutPanel.debajoTitulo')}</SelectItem>
                <SelectItem value="below_price">{t('pageLayoutPanel.debajoPrecio')}</SelectItem>
                <SelectItem value="below_buttons">{t('pageLayoutPanel.debajoBotones')}</SelectItem>
                <SelectItem value="above_gallery">{t('pageLayoutPanel.arribaGaleria')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {/* ===== Botones ===== */}
      {isProductDetail && (
        <>
          <div className="pt-2 border-t border-gray-100 dark:border-gray-700/50">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">{t('pageLayoutPanel.botonesAccion')}</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 dark:text-gray-400">{t('pageLayoutPanel.disposicionBotones')}</Label>
            <Select value={buttonsLayout} onValueChange={(v) => update('buttons_layout', v)}>
              <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stacked">{t('pageLayoutPanel.apiladosVertical')}</SelectItem>
                <SelectItem value="inline">{t('pageLayoutPanel.lineaHorizontal')}</SelectItem>
                <SelectItem value="split">{t('pageLayoutPanel.separadosUnoArribaUno')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {/* ===== Elementos opcionales ===== */}
      {isProductDetail && (
        <>
          <div className="pt-2 border-t border-gray-100 dark:border-gray-700/50">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">{t('pageLayoutPanel.elementosOpcionales')}</p>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-600 dark:text-gray-300">{t('pageLayoutPanel.mostrarBeneficios')}</Label>
            <Switch checked={showBenefits} onCheckedChange={(v) => update('show_benefits', v)} />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-600 dark:text-gray-300">{t('pageLayoutPanel.mostrarBreadcrumb')}</Label>
            <Switch checked={showBreadcrumb} onCheckedChange={(v) => update('show_breadcrumb', v)} />
          </div>
        </>
      )}

      {/* ===== Productos relacionados ===== */}
      {isProductDetail && (
        <>
          <div className="pt-2 border-t border-gray-100 dark:border-gray-700/50">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">{t('pageLayoutPanel.productosRelacionados')}</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 dark:text-gray-400">{t('pageLayoutPanel.disposicionRelacionados')}</Label>
            <Select value={relatedLayout} onValueChange={(v) => update('related_products_layout', v)}>
              <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="carousel">{t('pageLayoutPanel.carruselHorizontal')}</SelectItem>
                <SelectItem value="grid">{t('pageLayoutPanel.grillaResponsiva')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    </div>
  );
}
