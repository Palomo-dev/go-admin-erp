'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  Save,
  Loader2,
  Monitor,
  Laptop,
  Tablet,
  Smartphone,
  Eye,
  Globe,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/utils/Utils';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { WebsitePage } from '@/lib/services/websitePageBuilderService';
import { OutletSelector, type OutletOption } from './OutletSelector';
import type { Branch } from '@/types/branch';

export type DevicePreview = 'desktop' | 'laptop' | 'tablet' | 'mobile';

// F9.4 — Clasificación de páginas por grupo para el dropdown del editor
const DETAIL_TYPES = new Set(['product_detail', 'category_detail', 'space_detail']);
const FLOW_TYPES = new Set(['cart', 'checkout', 'order_confirmation', 'account']);

interface EditorHeaderProps {
  pages: WebsitePage[];
  currentPageId: string;
  onPageChange: (pageId: string) => void;
  devicePreview: DevicePreview;
  onDeviceChange: (device: DevicePreview) => void;
  isSaving: boolean;
  onSave: () => void;
  hasChanges: boolean;
  previewUrl: string | null;
  // F9.4 — Selector de contexto para plantillas de detalle
  previewEntities?: Array<{ id: string; label: string }>;
  previewEntityId?: string | null;
  onPreviewEntityChange?: (id: string) => void;
  // Fase 4 — Selector de outlet multi-outlet
  outletOptions?: OutletOption[];
  selectedBranchId?: number | null;
  onOutletChange?: (branchId: number | null) => void;
  selectedBranch?: Branch | null;
  // Indica si la página actual es global (para advertencia al editar desde outlet)
  currentPageIsGlobal?: boolean;
}

export default function EditorHeader({
  pages,
  currentPageId,
  onPageChange,
  devicePreview,
  onDeviceChange,
  isSaving,
  onSave,
  hasChanges,
  previewUrl,
  previewEntities,
  previewEntityId,
  onPreviewEntityChange,
  outletOptions,
  selectedBranchId,
  onOutletChange,
  selectedBranch,
  currentPageIsGlobal,
}: EditorHeaderProps) {
  const t = useTranslations('branding.editor.header');
  const currentPage = pages.find((p) => p.id === currentPageId);

  // F9.4 — Agrupar páginas por tipo: Páginas · Plantillas de detalle · Flujo de compra
  const regularPages = pages.filter((p) => !DETAIL_TYPES.has(p.page_type) && !FLOW_TYPES.has(p.page_type));
  const detailPages = pages.filter((p) => DETAIL_TYPES.has(p.page_type));
  const flowPages = pages.filter((p) => FLOW_TYPES.has(p.page_type));

  const devices: { id: DevicePreview; icon: typeof Monitor; label: string }[] = [
    { id: 'desktop', icon: Monitor, label: t('desktop') },
    { id: 'laptop', icon: Laptop, label: t('laptop') },
    { id: 'tablet', icon: Tablet, label: t('tablet') },
    { id: 'mobile', icon: Smartphone, label: t('mobile') },
  ];

  return (
    <div className="min-h-14 h-auto bg-blue-600 text-white flex flex-wrap items-center justify-between px-4 border-b border-blue-700 shrink-0 dark:border-blue-200">
      {/* Left: Back + Page name */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/app/organizacion/branding"
          className="p-1.5 rounded hover:bg-white/10 transition-colors dark:hover:bg-gray-800/10"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="flex items-center gap-2">
          <span className="text-sm text-blue-200 dark:text-blue-700">{t('editing')}</span>
          <Select value={currentPageId} onValueChange={onPageChange}>
            <SelectTrigger className="h-8 w-full sm:w-[180px] bg-white/10 border-white/20 text-white text-sm dark:bg-gray-800/10 dark:border-gray-700/20">
              <SelectValue placeholder={t('selectPage')} />
            </SelectTrigger>
            <SelectContent>
              {regularPages.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500">Páginas</div>
                  {regularPages.map((page) => (
                    <SelectItem key={page.id} value={page.id}>
                      {page.title}
                    </SelectItem>
                  ))}
                </>
              )}
              {detailPages.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 border-t mt-1">Plantillas de detalle</div>
                  {detailPages.map((page) => (
                    <SelectItem key={page.id} value={page.id}>
                      {page.title}
                    </SelectItem>
                  ))}
                </>
              )}
              {flowPages.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 border-t mt-1">Flujo de compra</div>
                  {flowPages.map((page) => (
                    <SelectItem key={page.id} value={page.id}>
                      {page.title}
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Fase 4 — Indicador visual del outlet activo */}
        {selectedBranch ? (
          <Badge variant="outline" className="gap-1 bg-white/10 border-white/20 text-white dark:bg-gray-800/10 dark:border-gray-700/20 dark:text-gray-200">
            {selectedBranch.name}
            {selectedBranch.branch_type && (
              <span className="text-[10px] text-blue-100 dark:text-blue-300">
                · {selectedBranch.branch_type}
              </span>
            )}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 bg-white/10 border-white/20 text-white dark:bg-gray-800/10 dark:border-gray-700/20 dark:text-gray-200">
            <Globe className="h-3 w-3" />
            Global
          </Badge>
        )}

        {/* F9.4 — Selector de contexto para plantillas de detalle */}
        {previewEntities && previewEntities.length > 0 && onPreviewEntityChange && (
          <Select value={previewEntityId || undefined} onValueChange={onPreviewEntityChange}>
            <SelectTrigger className="h-8 w-[200px] bg-white/10 border-white/20 text-white text-sm dark:bg-gray-800/10 dark:border-gray-700/20">
              <SelectValue placeholder="Seleccionar entidad" />
            </SelectTrigger>
            <SelectContent>
              {previewEntities.map((entity) => (
                <SelectItem key={entity.id} value={entity.id}>
                  {entity.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Center: Device Preview Toggle */}
      <div className="flex items-center gap-1 bg-white/10 rounded-lg p-0.5 dark:bg-gray-800/10">
        {devices.map((device) => {
          const Icon = device.icon;
          return (
            <button
              key={device.id}
              onClick={() => onDeviceChange(device.id)}
              title={device.label}
              className={cn(
                'p-1.5 rounded transition-colors',
                devicePreview === device.id
                  ? 'bg-white/20 text-white dark:bg-gray-800/20'
                  : 'text-gray-400 hover:text-white hover:bg-white/10 dark:text-gray-500 dark:hover:bg-gray-800/10'
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      {/* Right: Preview + Save */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Fase 4 — Selector de outlet */}
        {outletOptions && onOutletChange && selectedBranchId !== undefined && (
          <OutletSelector
            options={outletOptions}
            value={selectedBranchId}
            onChange={onOutletChange}
          />
        )}

        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded hover:bg-white/10 transition-colors text-gray-300 hover:text-white dark:hover:bg-gray-800/10 dark:text-gray-600"
          >
            <Eye className="h-3.5 w-3.5" />
            {t('viewSite')}
          </a>
        )}

        <Button
          size="sm"
          onClick={onSave}
          disabled={isSaving || !hasChanges}
          className={cn(
            'h-8 text-sm',
            hasChanges
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-gray-600 hover:bg-gray-500'
          )}
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1.5" />
          )}
          {t('save')}
        </Button>
      </div>

      {/* Fase 4 §6.3 — Advertencia al editar página global desde un outlet */}
      {currentPageIsGlobal && selectedBranchId !== null && selectedBranchId !== undefined && (
        <div className="w-full bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-800 px-4 py-2 text-xs text-amber-800 dark:text-amber-200">
          ⚠ Estás editando una página <strong>global</strong>. Los cambios afectan a
          todos los outlets de la organización.
        </div>
      )}
    </div>
  );
}
