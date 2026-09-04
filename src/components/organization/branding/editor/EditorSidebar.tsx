'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  Settings,
  Type,
  Layout,
  Palette,
  Search,
  Menu,
  LayoutPanelLeft,
  Database,
  GalleryHorizontalEnd,
  MousePointerClick,
  Wrench,
  Undo2,
  Redo2,
  Copy,
  ClipboardPaste,
  Layers,
  Bookmark,
  PaintRoller,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import { useTranslations } from 'next-intl';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type {
  WebsitePageSection,
  SectionTypeDefinition,
  ContentFieldDef,
  FieldGroup,
} from '@/lib/services/websitePageBuilderService';
import { getSectionDefinition } from '@/lib/services/websitePageBuilderService';
import { getSectionSyncStatus, type SectionManifest } from '@/lib/services/website/sectionContract';
import { getDefaultSectionsForPageType } from '@/lib/services/website/defaultProductDetailSections';
import FieldRenderer from './fields/FieldRenderer';
import type { ThemePalette, Viewport } from './fields/types';

// Mapa de iconos por nombre (para SectionListItem)
const ICON_MAP: Record<string, any> = {
  Image: Layout,
  BedDouble: Layout,
  Sparkles: Layout,
  Images: Layout,
  MessageSquareQuote: Layout,
  MousePointerClick: Layout,
  Mail: Layout,
  MapPin: Layout,
  BarChart3: Layout,
  Type,
  Users: Layout,
  HelpCircle: Layout,
  Newspaper: Layout,
  ShoppingBag: Layout,
  Star: Layout,
  CalendarCheck: Layout,
  LayoutPanelLeft,
  UtensilsCrossed: Layout,
  CreditCard: Layout,
  Flame: Layout,
  Megaphone: Layout,
  Award: Layout,
  FolderOpen: Layout,
  Filter: Layout,
  LayoutGrid: Layout,
  FolderTree: Layout,
  FileText: Layout,
};

// Orden y etiquetas de los grupos del editor (F0.4)
const GROUP_ORDER: { id: FieldGroup; label: string; icon: any }[] = [
  { id: 'content', label: 'Contenido', icon: Type },
  { id: 'data', label: 'Datos', icon: Database },
  { id: 'layout', label: 'Diseño', icon: Layout },
  { id: 'style', label: 'Estilo', icon: Palette },
  { id: 'carousel', label: 'Carrusel', icon: GalleryHorizontalEnd },
  { id: 'behavior', label: 'Comportamiento', icon: MousePointerClick },
  { id: 'advanced', label: 'Avanzado', icon: Wrench },
];

/**
 * Evalúa `showIf` antes de renderizar un campo (F0.4).
 */
function isFieldVisible(
  field: ContentFieldDef,
  content: Record<string, any>,
  variant: string,
): boolean {
  const c = field.showIf;
  if (!c) return true;
  if (c.variantIn && !c.variantIn.includes(variant)) return false;
  if (c.field) {
    const v = content?.[c.field];
    if (c.equals !== undefined && v !== c.equals) return false;
    if (c.in && !c.in.includes(v)) return false;
  }
  return true;
}

interface EditorSidebarProps {
  sections: WebsitePageSection[];
  activeSectionId: string | null;
  onSelectSection: (sectionId: string | null) => void;
  onUpdateSectionContent: (sectionId: string, content: Record<string, any>) => void;
  onUpdateSectionVariant: (sectionId: string, variant: string) => void;
  onToggleVisibility: (sectionId: string, visible: boolean) => void;
  onDeleteSection: (sectionId: string) => void;
  onAddSection: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  showGlobalSettings: boolean;
  onToggleGlobalSettings: () => void;
  globalSettingsContent?: React.ReactNode;
  showPageSEO: boolean;
  onTogglePageSEO: () => void;
  pageSEOContent?: React.ReactNode;
  showMenuConfig: boolean;
  onToggleMenuConfig: () => void;
  menuConfigContent?: React.ReactNode;
  showFooterConfig: boolean;
  onToggleFooterConfig: () => void;
  footerConfigContent?: React.ReactNode;
  organizationId?: number;
  /** Paleta del tema activo para ColorField (F0.3). */
  themePalette?: ThemePalette;
  /** Viewport activo del preview para ResponsiveField (F0.3). */
  activeViewport?: Viewport;
  /** Manifiesto del sitio para detectar secciones desincronizadas (F0.6). */
  sectionManifest?: SectionManifest | null;
  // F12.3 — Undo/Redo
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  // F12.4 — Acciones del editor
  onDuplicateSection?: (sectionId: string) => void;
  onCopyStyle?: (sectionId: string) => void;
  onPasteStyle?: (sectionId: string) => void;
  onApplyStyleToAll?: (sectionId: string) => void;
  onSaveSectionAsPreset?: (sectionId: string, name: string) => void;
  // F12.4 — Búsqueda de secciones
  sectionSearch?: string;
  onSectionSearchChange?: (value: string) => void;
  // F9.3 — Panel de layout de página (page_settings)
  showPageLayout?: boolean;
  onTogglePageLayout?: () => void;
  pageLayoutContent?: React.ReactNode;
  // F9.2 — Secciones por defecto (materialización)
  pageType?: string;
  onMaterializeDefaultSections?: () => void;
}

export default function EditorSidebar({
  sections,
  activeSectionId,
  onSelectSection,
  onUpdateSectionContent,
  onUpdateSectionVariant,
  onToggleVisibility,
  onDeleteSection,
  onAddSection,
  onReorder,
  showGlobalSettings,
  onToggleGlobalSettings,
  globalSettingsContent,
  showPageSEO,
  onTogglePageSEO,
  pageSEOContent,
  showMenuConfig,
  onToggleMenuConfig,
  menuConfigContent,
  showFooterConfig,
  onToggleFooterConfig,
  footerConfigContent,
  organizationId,
  themePalette,
  activeViewport,
  sectionManifest,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onDuplicateSection,
  onCopyStyle,
  onPasteStyle,
  onApplyStyleToAll,
  onSaveSectionAsPreset,
  sectionSearch,
  onSectionSearchChange,
  showPageLayout,
  onTogglePageLayout,
  pageLayoutContent,
  pageType,
  onMaterializeDefaultSections,
}: EditorSidebarProps) {
  const t = useTranslations('branding.editor.sidebar');
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // F12.4 — Filtrar secciones por búsqueda
  const filteredSections = sectionSearch
    ? sections.filter((s) => {
        const def = getSectionDefinition(s.section_type);
        const label = (def?.label || s.section_type).toLowerCase();
        const variantLabel = (def?.variants.find((v) => v.id === s.section_variant)?.label || s.section_variant).toLowerCase();
        const q = sectionSearch.toLowerCase();
        return label.includes(q) || variantLabel.includes(q) || s.section_type.includes(q);
      })
    : sections;

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIndex !== null && dragIndex !== index) {
      onReorder(dragIndex, index);
      setDragIndex(index);
    }
  };
  const handleDragEnd = () => setDragIndex(null);

  const renderCollapsiblePanel = (
    show: boolean,
    onToggle: () => void,
    icon: React.ReactNode,
    label: string,
    content?: React.ReactNode,
  ) => (
    <div className="border-b border-gray-200 dark:border-gray-700/50">
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-3 text-sm hover:bg-gray-100 dark:hover:bg-white/5 transition-colors',
          show && 'bg-gray-100 dark:bg-white/5',
        )}
      >
        {icon}
        <span className="flex-1 text-left font-medium text-gray-700 dark:text-gray-200">{label}</span>
        {show ? (
          <ChevronDown className="h-4 w-4 text-gray-400 dark:text-gray-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400 dark:text-gray-500" />
        )}
      </button>
      {show && <div className="px-3 pb-3 space-y-3">{content}</div>}
    </div>
  );

  return (
    <div className="flex-1 md:flex-none md:w-[320px] md:min-w-[320px] bg-white dark:bg-gray-900 text-gray-800 dark:text-white flex flex-col h-full min-h-0 overflow-hidden border-r border-gray-200 dark:border-gray-700">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700/50 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
            {t('sections')}
          </h2>
          {/* F12.3 — Undo/Redo buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => onUndo?.()}
              disabled={!canUndo}
              aria-label="Deshacer (Ctrl+Z)"
              title="Deshacer (Ctrl+Z)"
              className={cn(
                'p-1 rounded transition-colors',
                canUndo
                  ? 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10'
                  : 'text-gray-300 dark:text-gray-700 cursor-not-allowed',
              )}
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onRedo?.()}
              disabled={!canRedo}
              aria-label="Rehacer (Ctrl+Shift+Z)"
              title="Rehacer (Ctrl+Shift+Z)"
              className={cn(
                'p-1 rounded transition-colors',
                canRedo
                  ? 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10'
                  : 'text-gray-300 dark:text-gray-700 cursor-not-allowed',
              )}
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {/* F12.4 — Búsqueda de secciones */}
        {onSectionSearchChange && (
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              value={sectionSearch || ''}
              onChange={(e) => onSectionSearchChange(e.target.value)}
              placeholder="Buscar sección..."
              aria-label="Buscar sección"
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/5 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {renderCollapsiblePanel(
          showGlobalSettings,
          onToggleGlobalSettings,
          <Settings className="h-4 w-4 text-gray-500 dark:text-gray-400" />,
          t('themeConfig'),
          globalSettingsContent,
        )}
        {renderCollapsiblePanel(
          showPageSEO,
          onTogglePageSEO,
          <Search className="h-4 w-4 text-gray-500 dark:text-gray-400" />,
          t('pageSEO'),
          pageSEOContent,
        )}
        {renderCollapsiblePanel(
          showMenuConfig,
          onToggleMenuConfig,
          <Menu className="h-4 w-4 text-gray-500 dark:text-gray-400" />,
          t('menuConfig'),
          menuConfigContent,
        )}
        {renderCollapsiblePanel(
          showFooterConfig,
          onToggleFooterConfig,
          <LayoutPanelLeft className="h-4 w-4 text-gray-500 dark:text-gray-400" />,
          'Footer',
          footerConfigContent,
        )}
        {showPageLayout !== undefined && onTogglePageLayout &&
          renderCollapsiblePanel(
            showPageLayout,
            onTogglePageLayout,
            <Layout className="h-4 w-4 text-gray-500 dark:text-gray-400" />,
            'Layout de página',
            pageLayoutContent,
          )}

        {/* F9.2 — Secciones por defecto (solo si la página no tiene secciones) */}
        {sections.length === 0 && pageType && onMaterializeDefaultSections && (() => {
          const defaultSections = getDefaultSectionsForPageType(pageType);
          if (defaultSections.length === 0) return null;
          return (
            <div className="mx-3 my-2 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-3">
              <div className="flex items-start gap-2 mb-2">
                <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">
                    Secciones por defecto
                  </p>
                  <p className="text-[11px] text-blue-700/80 dark:text-blue-300/70 mt-0.5">
                    Esta página usa el layout por defecto. Materializa las secciones para editarlas individualmente.
                  </p>
                </div>
              </div>
              <ul className="space-y-1 mb-2">
                {defaultSections.map((ds) => {
                  const def = getSectionDefinition(ds.section_type);
                  const IconComponent = def ? ICON_MAP[def.icon] || Layout : Layout;
                  return (
                    <li key={ds.id} className="flex items-center gap-2 text-[11px] text-gray-600 dark:text-gray-400 py-1 px-2 rounded bg-white/60 dark:bg-white/5">
                      <IconComponent className="h-3 w-3 shrink-0 text-gray-400" />
                      <span className="truncate">{ds.label}</span>
                    </li>
                  );
                })}
              </ul>
              <Button
                onClick={onMaterializeDefaultSections}
                size="sm"
                variant="outline"
                className="w-full h-7 text-[11px] border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30"
              >
                <Plus className="h-3 w-3 mr-1" />
                Materializar secciones
              </Button>
            </div>
          );
        })()}

        {filteredSections.map((section, index) => {
          const def = getSectionDefinition(section.section_type);
          const isActive = activeSectionId === section.id;
          const IconComponent = def ? ICON_MAP[def.icon] || Layout : Layout;
          return (
            <SectionListItem
              key={section.id}
              section={section}
              definition={def}
              IconComponent={IconComponent}
              isActive={isActive}
              index={index}
              onSelect={() => onSelectSection(isActive ? null : section.id)}
              onUpdateContent={(content) => onUpdateSectionContent(section.id, content)}
              onUpdateVariant={(variant) => onUpdateSectionVariant(section.id, variant)}
              onToggleVisibility={(visible) => onToggleVisibility(section.id, visible)}
              onDelete={() => onDeleteSection(section.id)}
              onDuplicate={() => onDuplicateSection?.(section.id)}
              onCopyStyle={() => onCopyStyle?.(section.id)}
              onPasteStyle={() => onPasteStyle?.(section.id)}
              onApplyStyleToAll={() => onApplyStyleToAll?.(section.id)}
              onSaveAsPreset={(name) => onSaveSectionAsPreset?.(section.id, name)}
              organizationId={organizationId}
              themePalette={themePalette}
              activeViewport={activeViewport}
              sectionManifest={sectionManifest}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
            />
          );
        })}
      </div>

      <div className="p-3 border-t border-gray-200 dark:border-gray-700/50">
        <Button
          onClick={onAddSection}
          variant="outline"
          size="sm"
          className="w-full border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-white hover:border-blue-400 dark:hover:border-gray-400 bg-transparent hover:bg-blue-50 dark:hover:bg-white/5"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t('addSection')}
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// SECTION LIST ITEM (Collapsible) — usa FieldRenderer + Accordion
// ============================================================

interface SectionListItemProps {
  section: WebsitePageSection;
  definition: SectionTypeDefinition | undefined;
  IconComponent: any;
  isActive: boolean;
  index: number;
  onSelect: () => void;
  onUpdateContent: (content: Record<string, any>) => void;
  onUpdateVariant: (variant: string) => void;
  onToggleVisibility: (visible: boolean) => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  onCopyStyle?: () => void;
  onPasteStyle?: () => void;
  onApplyStyleToAll?: () => void;
  onSaveAsPreset?: (name: string) => void;
  organizationId?: number;
  themePalette?: ThemePalette;
  activeViewport?: Viewport;
  sectionManifest?: SectionManifest | null;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function SectionListItem({
  section,
  definition,
  IconComponent,
  isActive,
  onSelect,
  onUpdateContent,
  onUpdateVariant,
  onToggleVisibility,
  onDelete,
  onDuplicate,
  onCopyStyle,
  onPasteStyle,
  onApplyStyleToAll,
  onSaveAsPreset,
  organizationId,
  themePalette,
  activeViewport,
  sectionManifest,
  onDragStart,
  onDragOver,
  onDragEnd,
}: SectionListItemProps) {
  const t = useTranslations('branding.editor.sidebar');
  const label = definition?.label || section.section_type;
  const variantLabel = definition?.variants.find(
    (v) => v.id === section.section_variant,
  )?.label || section.section_variant;

  // F0.6 — detectar desincronización con el manifiesto del sitio.
  const syncStatus = getSectionSyncStatus(
    section.section_type,
    section.section_variant,
    sectionManifest,
  );

  // Diálogo de confirmación para aplicar estilo a todas las secciones
  const [showApplyAllConfirm, setShowApplyAllConfirm] = useState(false);
  // Diálogo para pedir nombre de plantilla (reemplaza window.prompt)
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [presetName, setPresetName] = useState('');

  // Agrupar campos por `field.group` respetando el orden de GROUP_ORDER.
  const fields = definition?.contentFields || [];
  const grouped: Record<string, ContentFieldDef[]> = {};
  fields.forEach((f) => {
    const g = f.group || 'content';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(f);
  });
  const visibleGroups = GROUP_ORDER.filter((g) =>
    grouped[g.id]?.some((f) => isFieldVisible(f, section.content, section.section_variant)),
  );

  const handleFieldChange = (field: ContentFieldDef, v: unknown) => {
    // `spacing` escribe múltiples keys: v es el content mergeado completo.
    if (field.type === 'spacing') {
      onUpdateContent(v as Record<string, any>);
      return;
    }
    const next = { ...section.content, [field.key]: v };
    // Exclusión mutua: show_icon y show_image en categories_grid.
    // Al activar uno, se desactiva el otro para evitar conflictos de media_source.
    if (field.key === 'show_icon' && v === true) {
      next.show_image = false;
    } else if (field.key === 'show_image' && v === true) {
      next.show_icon = false;
    }
    onUpdateContent(next);
  };

  return (
    <div
      className="border-b border-gray-200 dark:border-gray-700/50"
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      {/* Section Header */}
      <div
        onClick={onSelect}
        role="button"
        tabIndex={0}
        aria-expanded={isActive}
        aria-label={`Sección ${label}, variante ${variantLabel}${isActive ? ', seleccionada' : ', click para editar'}`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
        className={cn(
          'flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/5 transition-colors group',
          isActive && 'bg-blue-50 dark:bg-white/10',
          !section.is_visible && 'opacity-50',
        )}
      >
        <GripVertical className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 cursor-grab shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        <IconComponent className="h-4 w-4 text-blue-600 dark:text-gray-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium min-w-0 break-words text-gray-800 dark:text-white">{label}</p>
            {syncStatus.isOrphan && (
              <span
                title={syncStatus.reason || 'Sección desincronizada con el sitio'}
                className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 text-[10px] font-bold"
              >
                !
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 min-w-0 break-words">{variantLabel}</p>
        </div>
        {isActive ? (
          <ChevronDown className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
        )}
      </div>

      {/* Section Content Editor */}
      {isActive && (
        <div className="px-3 pb-3 space-y-3 bg-gray-50 dark:bg-white/5">
          {/* Variant Selector */}
          {definition && definition.variants.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 dark:text-gray-400">{t('variant')}</Label>
              <Select value={section.section_variant} onValueChange={onUpdateVariant}>
                <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {definition.variants.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Campos agrupados por Accordion (F0.4) */}
          <Accordion type="multiple" defaultValue={['content']}>
            {visibleGroups.map((g) => (
              <AccordionItem key={g.id} value={g.id} className="border-gray-200 dark:border-gray-700/50">
                <AccordionTrigger className="text-xs text-gray-600 dark:text-gray-300 hover:no-underline">
                  <span className="flex items-center gap-2">
                    <g.icon className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                    {g.label}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  {grouped[g.id].map((field) => {
                    if (!isFieldVisible(field, section.content, section.section_variant)) {
                      return null;
                    }
                    // `spacing` recibe el content completo como valor.
                    const fieldValue = field.type === 'spacing' ? section.content : section.content?.[field.key];
                    return (
                      <div key={field.key} className="space-y-1">
                        {field.type !== 'boolean' && field.type !== 'spacing' && (
                          <Label className="text-xs text-gray-500 dark:text-gray-400">
                            {field.label}
                          </Label>
                        )}
                        {field.type === 'boolean' && (
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-gray-500 dark:text-gray-400">
                              {field.label}
                            </Label>
                          </div>
                        )}
                        <FieldRenderer
                          field={field}
                          value={fieldValue}
                          onChange={(v) => handleFieldChange(field, v)}
                          themePalette={themePalette}
                          organizationId={organizationId}
                          activeViewport={activeViewport}
                        />
                        {field.helpText && (
                          <p className="text-[10px] text-gray-400 dark:text-gray-500">
                            {field.helpText}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          {/* Actions */}
          <div className="flex items-center gap-1 pt-2 border-t border-gray-200 dark:border-gray-700/50">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleVisibility(!section.is_visible); }}
              className="p-1 rounded hover:bg-white/10 transition-colors dark:hover:bg-gray-800/10"
              title={section.is_visible ? t('hideSection') : t('showSection')}
              aria-label={section.is_visible ? 'Ocultar sección' : 'Mostrar sección'}
            >
              {section.is_visible ? (
                <Eye className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
              ) : (
                <EyeOff className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
              )}
            </button>
            {onDuplicate && (
              <button
                onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                className="p-1 rounded hover:bg-white/10 transition-colors dark:hover:bg-gray-800/10"
                title="Duplicar sección (Ctrl+D)"
                aria-label="Duplicar sección"
              >
                <Layers className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
              </button>
            )}
            {onCopyStyle && (
              <button
                onClick={(e) => { e.stopPropagation(); onCopyStyle(); }}
                className="p-1 rounded hover:bg-white/10 transition-colors dark:hover:bg-gray-800/10"
                title="Copiar estilo"
                aria-label="Copiar estilo"
              >
                <Copy className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
              </button>
            )}
            {onPasteStyle && (
              <button
                onClick={(e) => { e.stopPropagation(); onPasteStyle(); }}
                className="p-1 rounded hover:bg-white/10 transition-colors dark:hover:bg-gray-800/10"
                title="Pegar estilo"
                aria-label="Pegar estilo"
              >
                <ClipboardPaste className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
              </button>
            )}
            {onApplyStyleToAll && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowApplyAllConfirm(true);
                }}
                className="p-1 rounded hover:bg-white/10 transition-colors dark:hover:bg-gray-800/10"
                title="Aplicar estilo a todas las secciones"
                aria-label="Aplicar estilo a todas"
              >
                <PaintRoller className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
              </button>
            )}
            {onSaveAsPreset && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPresetName('');
                  setShowPresetDialog(true);
                }}
                className="p-1 rounded hover:bg-white/10 transition-colors dark:hover:bg-gray-800/10"
                title="Guardar como plantilla"
                aria-label="Guardar como plantilla"
              >
                <Bookmark className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1 rounded hover:bg-red-900/30 transition-colors ml-auto"
              title={t('deleteSection')}
              aria-label="Eliminar sección"
            >
              <Trash2 className="h-3.5 w-3.5 text-red-400 dark:text-red-500" />
            </button>
          </div>
        </div>
      )}

      {/* Confirmar aplicar estilo a todas las secciones */}
      <ConfirmDialog
        open={showApplyAllConfirm}
        onOpenChange={setShowApplyAllConfirm}
        title="Aplicar estilo a todas"
        description="¿Aplicar el estilo de esta sección a todas las secciones de la página?"
        confirmLabel="Aplicar a todas"
        onConfirm={() => { onApplyStyleToAll?.(); }}
      />

      {/* Diálogo para nombre de plantilla (reemplaza window.prompt) */}
      <Dialog open={showPresetDialog} onOpenChange={setShowPresetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guardar como plantilla</DialogTitle>
            <DialogDescription>Ingresa un nombre para esta plantilla de sección.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Nombre de la plantilla"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && presetName.trim()) {
                  onSaveAsPreset?.(presetName.trim());
                  setShowPresetDialog(false);
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPresetDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (presetName.trim()) {
                  onSaveAsPreset?.(presetName.trim());
                  setShowPresetDialog(false);
                }
              }}
              disabled={!presetName.trim()}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
