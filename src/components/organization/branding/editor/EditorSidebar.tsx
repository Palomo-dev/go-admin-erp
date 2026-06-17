'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ImagePickerDialog from '@/components/common/ImagePickerDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  GripVertical,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  Settings,
  Palette,
  Type,
  Layout,
  Image,
  BedDouble,
  Sparkles,
  Images,
  MessageSquareQuote,
  MousePointerClick,
  Mail,
  MapPin,
  BarChart3,
  Users,
  HelpCircle,
  Newspaper,
  ShoppingBag,
  Star,
  CalendarCheck,
  LayoutPanelLeft,
  UtensilsCrossed,
  CreditCard,
  Search,
  ImagePlus,
  X,
  Flame,
  Megaphone,
  Award,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import { useTranslations } from 'next-intl';
import type {
  WebsitePageSection,
  SectionTypeDefinition,
} from '@/lib/services/websitePageBuilderService';
import { getSectionDefinition } from '@/lib/services/websitePageBuilderService';

// Mapa de iconos por nombre
const ICON_MAP: Record<string, any> = {
  Image,
  BedDouble,
  Sparkles,
  Images,
  MessageSquareQuote,
  MousePointerClick,
  Mail,
  MapPin,
  BarChart3,
  Type,
  Users,
  HelpCircle,
  Newspaper,
  ShoppingBag,
  Star,
  CalendarCheck,
  LayoutPanelLeft,
  UtensilsCrossed,
  CreditCard,
  Flame,
  Megaphone,
  Award,
};

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
  // Global settings
  showGlobalSettings: boolean;
  onToggleGlobalSettings: () => void;
  globalSettingsContent?: React.ReactNode;
  // Page SEO
  showPageSEO: boolean;
  onTogglePageSEO: () => void;
  pageSEOContent?: React.ReactNode;
  organizationId?: number;
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
  organizationId,
}: EditorSidebarProps) {
  const t = useTranslations('branding.editor.sidebar');
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      onReorder(dragIndex, index);
      setDragIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  return (
    <div className="w-[320px] min-w-[320px] bg-white dark:bg-gray-900 text-gray-800 dark:text-white flex flex-col h-full border-r border-gray-200 dark:border-gray-700">
      {/* Sidebar Header */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700/50">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
          {t('sections')}
        </h2>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Configuración del Tema (Global Settings) */}
        <div className="border-b border-gray-200 dark:border-gray-700/50">
          <button
            onClick={onToggleGlobalSettings}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-3 text-sm hover:bg-gray-100 dark:hover:bg-white/5 transition-colors',
              showGlobalSettings && 'bg-gray-100 dark:bg-white/5'
            )}
          >
            <Settings className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <span className="flex-1 text-left font-medium text-gray-700 dark:text-gray-200">{t('themeConfig')}</span>
            {showGlobalSettings ? (
              <ChevronDown className="h-4 w-4 text-gray-400 dark:text-gray-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-400 dark:text-gray-500" />
            )}
          </button>
          {showGlobalSettings && (
            <div className="px-3 pb-3 space-y-3">
              {globalSettingsContent}
            </div>
          )}
        </div>

        {/* SEO de la Página */}
        <div className="border-b border-gray-200 dark:border-gray-700/50">
          <button
            onClick={onTogglePageSEO}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-3 text-sm hover:bg-gray-100 dark:hover:bg-white/5 transition-colors',
              showPageSEO && 'bg-gray-100 dark:bg-white/5'
            )}
          >
            <Search className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <span className="flex-1 text-left font-medium text-gray-700 dark:text-gray-200">{t('pageSEO')}</span>
            {showPageSEO ? (
              <ChevronDown className="h-4 w-4 text-gray-400 dark:text-gray-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-400 dark:text-gray-500" />
            )}
          </button>
          {showPageSEO && (
            <div className="px-3 pb-3 space-y-3">
              {pageSEOContent}
            </div>
          )}
        </div>

        {/* Sections List */}
        {sections.map((section, index) => {
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
              organizationId={organizationId}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
            />
          );
        })}
      </div>

      {/* Add Section Button */}
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
// SECTION LIST ITEM (Collapsible)
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
  organizationId?: number;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function SectionListItem({
  section,
  definition,
  IconComponent,
  isActive,
  index,
  onSelect,
  onUpdateContent,
  onUpdateVariant,
  onToggleVisibility,
  onDelete,
  organizationId,
  onDragStart,
  onDragOver,
  onDragEnd,
}: SectionListItemProps) {
  const t = useTranslations('branding.editor.sidebar');
  const label = definition?.label || section.section_type;
  const variantLabel = definition?.variants.find(
    (v) => v.id === section.section_variant
  )?.label || section.section_variant;

  return (
    <div
      className="border-b border-gray-200 dark:border-gray-700/50"
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      {/* Section Header (clickable) */}
      <div
        onClick={onSelect}
        className={cn(
          'flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/5 transition-colors group',
          isActive && 'bg-blue-50 dark:bg-white/10',
          !section.is_visible && 'opacity-50'
        )}
      >
        <GripVertical className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 cursor-grab shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        <IconComponent className="h-4 w-4 text-blue-600 dark:text-gray-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate text-gray-800 dark:text-white">{label}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{variantLabel}</p>
        </div>
        {isActive ? (
          <ChevronDown className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
        )}
      </div>

      {/* Section Content Editor (expanded) */}
      {isActive && (
        <div className="px-3 pb-3 space-y-3 bg-gray-50 dark:bg-white/5">
          {/* Variant Selector */}
          {definition && definition.variants.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 dark:text-gray-400">{t('variant')}</Label>
              <Select
                value={section.section_variant}
                onValueChange={onUpdateVariant}
              >
                <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {definition.variants.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Content Fields */}
          {definition?.contentFields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label className="text-xs text-gray-500 dark:text-gray-400">{field.label}</Label>
              {field.type === 'text' && (
                <Input
                  value={(section.content?.[field.key] as string) || ''}
                  onChange={(e) =>
                    onUpdateContent({
                      ...section.content,
                      [field.key]: e.target.value,
                    })
                  }
                  placeholder={field.placeholder}
                  className="h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
              )}
              {field.type === 'textarea' && (
                <Textarea
                  value={(section.content?.[field.key] as string) || ''}
                  onChange={(e) =>
                    onUpdateContent({
                      ...section.content,
                      [field.key]: e.target.value,
                    })
                  }
                  placeholder={field.placeholder}
                  rows={2}
                  className="text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-none"
                />
              )}
              {field.type === 'url' && (
                <Input
                  type="url"
                  value={(section.content?.[field.key] as string) || ''}
                  onChange={(e) =>
                    onUpdateContent({
                      ...section.content,
                      [field.key]: e.target.value,
                    })
                  }
                  placeholder={field.placeholder || 'https://...'}
                  className="h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
              )}
              {field.type === 'image' && (
                <ImageFieldPicker
                  value={(section.content?.[field.key] as string) || ''}
                  onChange={(url) =>
                    onUpdateContent({
                      ...section.content,
                      [field.key]: url,
                    })
                  }
                />
              )}
              {field.type === 'boolean' && (
                <div className="flex items-center justify-between">
                  <Switch
                    checked={section.content?.[field.key] ?? field.defaultValue ?? false}
                    onCheckedChange={(checked) =>
                      onUpdateContent({
                        ...section.content,
                        [field.key]: checked,
                      })
                    }
                  />
                </div>
              )}
              {field.type === 'number' && (
                <Input
                  type="number"
                  value={(section.content?.[field.key] as number) ?? ''}
                  onChange={(e) =>
                    onUpdateContent({
                      ...section.content,
                      [field.key]: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder={field.placeholder}
                  className="h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
              )}
              {field.type === 'select' && field.options && (
                <Select
                  value={(section.content?.[field.key] as string) || field.options[0]?.value || ''}
                  onValueChange={(val) =>
                    onUpdateContent({
                      ...section.content,
                      [field.key]: val,
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {field.type === 'range' && (
                <div className="flex items-center gap-2">
                  <Slider
                    value={[Number(section.content?.[field.key] ?? field.defaultValue ?? 0)]}
                    onValueChange={([val]) =>
                      onUpdateContent({
                        ...section.content,
                        [field.key]: val,
                      })
                    }
                    min={field.min ?? 0}
                    max={field.max ?? 100}
                    step={field.step ?? 1}
                    className="flex-1"
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[40px] text-right">
                    {Number(section.content?.[field.key] ?? field.defaultValue ?? 0)}{field.suffix || ''}
                  </span>
                </div>
              )}
            </div>
          ))}

          {/* Hero Booking Switch */}
          {section.section_type === 'hero' && (
            <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700/50">
              <Label className="text-xs text-gray-500 dark:text-gray-400">{t('bookingWidget')}</Label>
              <Switch
                checked={section.content?.show_booking_widget === true}
                onCheckedChange={(checked) =>
                  onUpdateContent({
                    ...section.content,
                    show_booking_widget: checked,
                  })
                }
              />
            </div>
          )}

          {/* Gallery Items Editor */}
          {section.section_type === 'gallery' && (
            <GalleryItemsEditor
              items={(section.content?.items as GalleryItem[]) || []}
              onChange={(items) =>
                onUpdateContent({ ...section.content, items })
              }
            />
          )}

          {/* Testimonials Items Editor */}
          {section.section_type === 'testimonials' && (
            <TestimonialItemsEditor
              items={(section.content?.items as TestimonialItem[]) || []}
              onChange={(items) =>
                onUpdateContent({ ...section.content, items })
              }
            />
          )}

          {/* FAQ Items Editor */}
          {section.section_type === 'faq' && (
            <FAQItemsEditor
              items={(section.content?.items as FAQItem[]) || []}
              onChange={(items) =>
                onUpdateContent({ ...section.content, items })
              }
            />
          )}

          {/* Hero Slides Editor (only for slider variant) */}
          {section.section_type === 'hero' && section.section_variant === 'slider' && (
            <HeroSlidesEditor
              items={(section.content?.slides as HeroSlideItem[]) || []}
              onChange={(slides) =>
                onUpdateContent({ ...section.content, slides })
              }
            />
          )}

          {/* Category Selector Editor */}
          {(section.section_type === 'categories_grid' || section.section_type === 'offers' || section.section_type === 'products_grid') && organizationId && (
            <CategorySelectorEditor
              organizationId={organizationId}
              selectedIds={(section.content?.selected_category_ids as number[]) || []}
              onChange={(ids) =>
                onUpdateContent({ ...section.content, selected_category_ids: ids })
              }
            />
          )}

          {/* Brands Items Editor */}
          {section.section_type === 'brands' && (
            <BrandsItemsEditor
              items={(section.content?.items as BrandItem[]) || []}
              onChange={(items) =>
                onUpdateContent({ ...section.content, items })
              }
            />
          )}

          {/* Spacing Controls (all sections) */}
          <SectionSpacingEditor
            paddingTop={(section.content?.padding_top as string) || 'lg'}
            paddingBottom={(section.content?.padding_bottom as string) || 'lg'}
            paddingX={(section.content?.padding_x as string) || 'md'}
            marginTop={(section.content?.margin_top as string) || 'none'}
            marginBottom={(section.content?.margin_bottom as string) || 'none'}
            onChange={(key, value) =>
              onUpdateContent({ ...section.content, [key]: value })
            }
          />

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700/50">
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisibility(!section.is_visible);
                }}
                className="p-1 rounded hover:bg-white/10 transition-colors"
                title={section.is_visible ? t('hideSection') : t('showSection')}
              >
                {section.is_visible ? (
                  <Eye className="h-3.5 w-3.5 text-gray-400" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 text-gray-500" />
                )}
              </button>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 rounded hover:bg-red-900/30 transition-colors"
              title={t('deleteSection')}
            >
              <Trash2 className="h-3.5 w-3.5 text-red-400" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// INTERFACES para items inline
// ============================================================

interface GalleryItem {
  id: string;
  url: string;
  alt: string;
  caption?: string;
}

interface BrandItem {
  id: string;
  name: string;
  logo_url?: string;
  url?: string;
}

interface TestimonialItem {
  id: string;
  name: string;
  company?: string;
  content: string;
  rating?: number;
}

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

interface HeroSlideItem {
  id: string;
  title?: string;
  subtitle?: string;
  image_url?: string;
  image_url_mobile?: string;
  cta_text?: string;
  cta_url?: string;
}

// ============================================================
// IMAGE FIELD PICKER (inline image selector with ImagePickerDialog)
// ============================================================

function ImageFieldPicker({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const t = useTranslations('branding.editor.sidebar');
  const [showPicker, setShowPicker] = useState(false);

  return (
    <>
      {value ? (
        <div className="relative group rounded-md overflow-hidden border border-gray-300 dark:border-gray-600">
          <img
            src={value}
            alt={t('imageAlt')}
            className="w-full h-20 object-cover cursor-pointer"
            onClick={() => setShowPicker(true)}
          />
          <button
            onClick={() => onChange('')}
            className="absolute top-1 right-1 p-0.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowPicker(true)}
          className="w-full h-16 flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-blue-400 hover:text-blue-500 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors bg-white dark:bg-white/5"
        >
          <ImagePlus className="h-4 w-4" />
          <span className="text-[10px]">{t('selectImage')}</span>
        </button>
      )}
      <ImagePickerDialog
        open={showPicker}
        onOpenChange={setShowPicker}
        onSelect={onChange}
      />
    </>
  );
}

// ============================================================
// GALLERY ITEMS EDITOR (inline gallery manager)
// ============================================================

function GalleryItemsEditor({
  items,
  onChange,
}: {
  items: GalleryItem[];
  onChange: (items: GalleryItem[]) => void;
}) {
  const t = useTranslations('branding.editor.sidebar');
  const [showPicker, setShowPicker] = useState(false);

  const handleAddImage = (url: string) => {
    onChange([...items, { id: crypto.randomUUID(), url, alt: '', caption: '' }]);
  };

  const handleRemove = (id: string) => {
    onChange(items.filter((i) => i.id !== id));
  };

  return (
    <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700/50">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-gray-500 dark:text-gray-400">
          {t('imagesLabel', { count: items.length })}
        </Label>
        <button
          onClick={() => setShowPicker(true)}
          className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
        >
          <Plus className="h-3 w-3" /> {t('add')}
        </button>
      </div>

      {items.length > 0 ? (
        <div className="grid grid-cols-3 gap-1.5">
          {items.map((img) => (
            <div
              key={img.id}
              className="relative group rounded overflow-hidden border border-gray-200 dark:border-gray-700"
            >
              <img
                src={img.url}
                alt={img.alt}
                className="w-full h-14 object-cover"
              />
              <button
                onClick={() => handleRemove(img.id)}
                className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center py-2">
          {t('noImages')}
        </p>
      )}

      <ImagePickerDialog
        open={showPicker}
        onOpenChange={setShowPicker}
        onSelect={handleAddImage}
        title={t('addImageToGallery')}
      />
    </div>
  );
}

// ============================================================
// TESTIMONIAL ITEMS EDITOR (inline testimonial manager)
// ============================================================

function TestimonialItemsEditor({
  items,
  onChange,
}: {
  items: TestimonialItem[];
  onChange: (items: TestimonialItem[]) => void;
}) {
  const tr = useTranslations('branding.editor.sidebar');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Asignar id a items que no lo tengan
  useEffect(() => {
    const hasEmpty = items.some((item) => !item.id);
    if (hasEmpty) {
      onChange(items.map((item) => item.id ? item : { ...item, id: crypto.randomUUID() }));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = () => {
    const newItem: TestimonialItem = {
      id: crypto.randomUUID(),
      name: '',
      content: '',
      rating: 5,
    };
    onChange([...items, newItem]);
    setExpandedId(newItem.id);
  };

  const handleUpdate = (id: string, updates: Partial<TestimonialItem>) => {
    onChange(items.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  };

  const handleRemove = (id: string) => {
    onChange(items.filter((t) => t.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  return (
    <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700/50">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-gray-500 dark:text-gray-400">
          {tr('testimonialsLabel', { count: items.length })}
        </Label>
        <button
          onClick={handleAdd}
          className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
        >
          <Plus className="h-3 w-3" /> {tr('add')}
        </button>
      </div>

      {items.length > 0 ? (
        <div className="space-y-1.5">
          {items.map((t, idx) => (
            <div
              key={t.id || `testimonial-${idx}`}
              className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/5 overflow-hidden"
            >
              <div
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5"
                onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
              >
                <MessageSquareQuote className="h-3 w-3 text-gray-400 shrink-0" />
                <span className="text-[11px] flex-1 truncate text-gray-700 dark:text-gray-300">
                  {t.name || tr('noName')}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemove(t.id); }}
                  className="p-0.5 hover:text-red-500 text-gray-400"
                >
                  <X className="h-3 w-3" />
                </button>
                {expandedId === t.id ? (
                  <ChevronUp className="h-3 w-3 text-gray-400" />
                ) : (
                  <ChevronDown className="h-3 w-3 text-gray-400" />
                )}
              </div>
              {expandedId === t.id && (
                <div className="px-2 pb-2 space-y-1.5 border-t border-gray-100 dark:border-gray-700/50">
                  <Input
                    value={t.name}
                    onChange={(e) => handleUpdate(t.id, { name: e.target.value })}
                    placeholder={tr('namePlaceholder')}
                    className="h-7 text-[11px] mt-1.5 bg-white dark:bg-white/5 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white"
                  />
                  <Input
                    value={t.company || ''}
                    onChange={(e) => handleUpdate(t.id, { company: e.target.value })}
                    placeholder={tr('companyPlaceholder')}
                    className="h-7 text-[11px] bg-white dark:bg-white/5 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white"
                  />
                  <Textarea
                    value={t.content}
                    onChange={(e) => handleUpdate(t.id, { content: e.target.value })}
                    placeholder={tr('testimonialPlaceholder')}
                    rows={2}
                    className="text-[11px] bg-white dark:bg-white/5 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white resize-none"
                  />
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => handleUpdate(t.id, { rating: star })}
                      >
                        <Star
                          className={cn(
                            'h-3.5 w-3.5',
                            star <= (t.rating || 0)
                              ? 'text-yellow-400 fill-yellow-400'
                              : 'text-gray-300 dark:text-gray-600'
                          )}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center py-2">
          {tr('noTestimonials')}
        </p>
      )}
    </div>
  );
}

// ============================================================
// FAQ ITEMS EDITOR (inline FAQ manager)
// ============================================================

function FAQItemsEditor({
  items,
  onChange,
}: {
  items: FAQItem[];
  onChange: (items: FAQItem[]) => void;
}) {
  const t = useTranslations('branding.editor.sidebar');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleAdd = () => {
    const newItem: FAQItem = {
      id: crypto.randomUUID(),
      question: '',
      answer: '',
    };
    onChange([...items, newItem]);
    setExpandedId(newItem.id);
  };

  const handleUpdate = (id: string, updates: Partial<FAQItem>) => {
    onChange(items.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const handleRemove = (id: string) => {
    onChange(items.filter((f) => f.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  return (
    <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700/50">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-gray-500 dark:text-gray-400">
          {t('faqLabel', { count: items.length })}
        </Label>
        <button
          onClick={handleAdd}
          className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
        >
          <Plus className="h-3 w-3" /> {t('add')}
        </button>
      </div>

      {items.length > 0 ? (
        <div className="space-y-1.5">
          {items.map((f) => (
            <div
              key={f.id}
              className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/5 overflow-hidden"
            >
              <div
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5"
                onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
              >
                <HelpCircle className="h-3 w-3 text-gray-400 shrink-0" />
                <span className="text-[11px] flex-1 truncate text-gray-700 dark:text-gray-300">
                  {f.question || t('noQuestion')}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemove(f.id); }}
                  className="p-0.5 hover:text-red-500 text-gray-400"
                >
                  <X className="h-3 w-3" />
                </button>
                {expandedId === f.id ? (
                  <ChevronUp className="h-3 w-3 text-gray-400" />
                ) : (
                  <ChevronDown className="h-3 w-3 text-gray-400" />
                )}
              </div>
              {expandedId === f.id && (
                <div className="px-2 pb-2 space-y-1.5 border-t border-gray-100 dark:border-gray-700/50">
                  <Input
                    value={f.question}
                    onChange={(e) => handleUpdate(f.id, { question: e.target.value })}
                    placeholder={t('questionPlaceholder')}
                    className="h-7 text-[11px] mt-1.5 bg-white dark:bg-white/5 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white"
                  />
                  <Textarea
                    value={f.answer}
                    onChange={(e) => handleUpdate(f.id, { answer: e.target.value })}
                    placeholder={t('answerPlaceholder')}
                    rows={2}
                    className="text-[11px] bg-white dark:bg-white/5 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white resize-none"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center py-2">
          {t('noQuestions')}
        </p>
      )}
    </div>
  );
}

// ============================================================
// HERO SLIDES EDITOR (inline slide manager for Hero Slider)
// ============================================================

function HeroSlidesEditor({
  items: rawItems,
  onChange,
}: {
  items: HeroSlideItem[];
  onChange: (items: HeroSlideItem[]) => void;
}) {
  const didNormalize = useRef(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Normalizar una sola vez: asignar id a slides que no tengan
  useEffect(() => {
    if (didNormalize.current) return;
    const needsIds = rawItems.some((s) => !s.id);
    if (needsIds && rawItems.length > 0) {
      didNormalize.current = true;
      onChange(rawItems.map((s) => (s.id ? s : { ...s, id: crypto.randomUUID() })));
    }
  }, [rawItems, onChange]);

  const items = rawItems.every((s) => s.id) ? rawItems : rawItems.map((s, i) => ({ ...s, id: s.id || `tmp-${i}` }));

  const handleAdd = () => {
    const newItem: HeroSlideItem = {
      id: crypto.randomUUID(),
      title: '',
      subtitle: '',
      image_url: '',
      cta_text: '',
      cta_url: '',
    };
    onChange([...items, newItem]);
    setExpandedId(newItem.id);
  };

  const handleUpdate = (id: string, updates: Partial<HeroSlideItem>) => {
    onChange(items.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const handleRemove = (id: string) => {
    onChange(items.filter((s) => s.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  return (
    <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700/50">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-gray-500 dark:text-gray-400">
          Slides ({items.length})
        </Label>
        <button
          onClick={handleAdd}
          className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
        >
          <Plus className="h-3 w-3" /> Agregar
        </button>
      </div>

      {items.length > 0 ? (
        <div className="space-y-1.5">
          {items.map((slide, idx) => (
            <div
              key={slide.id}
              className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/5 overflow-hidden"
            >
              <div
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5"
                onClick={() => setExpandedId(expandedId === slide.id ? null : slide.id)}
              >
                <Image className="h-3 w-3 text-gray-400 shrink-0" />
                <span className="text-[11px] flex-1 truncate text-gray-700 dark:text-gray-300">
                  {slide.title || `Slide ${idx + 1}`}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemove(slide.id); }}
                  className="p-0.5 hover:text-red-500 text-gray-400"
                >
                  <X className="h-3 w-3" />
                </button>
                {expandedId === slide.id ? (
                  <ChevronUp className="h-3 w-3 text-gray-400" />
                ) : (
                  <ChevronDown className="h-3 w-3 text-gray-400" />
                )}
              </div>
              {expandedId === slide.id && (
                <div className="px-2 pb-2 space-y-1.5 border-t border-gray-100 dark:border-gray-700/50">
                  <Label className="text-[10px] text-gray-400 mt-1.5 block">Título</Label>
                  <Input
                    value={slide.title || ''}
                    onChange={(e) => handleUpdate(slide.id, { title: e.target.value })}
                    placeholder="Título del slide"
                    className="h-7 text-[11px] bg-white dark:bg-white/5 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white"
                  />
                  <Label className="text-[10px] text-gray-400 block">Subtítulo</Label>
                  <Textarea
                    value={slide.subtitle || ''}
                    onChange={(e) => handleUpdate(slide.id, { subtitle: e.target.value })}
                    placeholder="Descripción del slide"
                    rows={2}
                    className="text-[11px] bg-white dark:bg-white/5 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white resize-none"
                  />
                  <Label className="text-[10px] text-gray-400 block">Imagen escritorio</Label>
                  <ImageFieldPicker
                    value={slide.image_url || ''}
                    onChange={(url) => handleUpdate(slide.id, { image_url: url })}
                  />
                  <Label className="text-[10px] text-gray-400 block">Imagen móvil</Label>
                  <ImageFieldPicker
                    value={slide.image_url_mobile || ''}
                    onChange={(url) => handleUpdate(slide.id, { image_url_mobile: url })}
                  />
                  <Label className="text-[10px] text-gray-400 block">Texto del botón</Label>
                  <Input
                    value={slide.cta_text || ''}
                    onChange={(e) => handleUpdate(slide.id, { cta_text: e.target.value })}
                    placeholder="Ver más"
                    className="h-7 text-[11px] bg-white dark:bg-white/5 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white"
                  />
                  <Label className="text-[10px] text-gray-400 block">URL del botón</Label>
                  <Input
                    value={slide.cta_url || ''}
                    onChange={(e) => handleUpdate(slide.id, { cta_url: e.target.value })}
                    placeholder="/productos"
                    className="h-7 text-[11px] bg-white dark:bg-white/5 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center py-2">
          Sin slides. Agrega al menos uno.
        </p>
      )}
    </div>
  );
}

// ============================================================
// CATEGORY SELECTOR EDITOR (select + reorder categories)
// ============================================================

interface CategoryOption {
  id: number;
  name: string;
  image_url?: string;
}

function CategorySelectorEditor({
  organizationId,
  selectedIds,
  onChange,
}: {
  organizationId: number;
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('categories')
        .select('id, name, image_url')
        .eq('organization_id', organizationId)
        .order('rank', { ascending: true });
      setCategories(data || []);
      setLoading(false);
    };
    load();
  }, [organizationId]);

  const handleToggle = (catId: number, checked: boolean) => {
    if (checked) {
      onChange([...selectedIds, catId]);
    } else {
      onChange(selectedIds.filter((id) => id !== catId));
    }
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) {
      const reordered = [...selectedIds];
      const [moved] = reordered.splice(dragIdx, 1);
      reordered.splice(idx, 0, moved);
      onChange(reordered);
      setDragIdx(idx);
    }
  };
  const handleDragEnd = () => setDragIdx(null);

  const selectedCats = selectedIds
    .map((id) => categories.find((c) => c.id === id))
    .filter(Boolean) as CategoryOption[];

  const unselectedCats = categories.filter((c) => !selectedIds.includes(c.id));

  if (loading) {
    return (
      <div className="pt-2 border-t border-gray-200 dark:border-gray-700/50">
        <p className="text-[10px] text-gray-400 text-center py-2">Cargando categorías...</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700/50">
      <Label className="text-xs text-gray-500 dark:text-gray-400">
        Categorías seleccionadas ({selectedIds.length})
      </Label>

      {selectedCats.length > 0 && (
        <div className="space-y-1">
          {selectedCats.map((cat, idx) => (
            <div
              key={cat.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              className={cn(
                'flex items-center gap-2 p-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/5 cursor-grab',
                dragIdx === idx && 'opacity-50'
              )}
            >
              <GripVertical className="h-3 w-3 text-gray-400 shrink-0" />
              {cat.image_url ? (
                <img src={cat.image_url} alt={cat.name} className="w-6 h-6 rounded object-cover shrink-0" />
              ) : (
                <div className="w-6 h-6 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
                  <span className="text-[10px]">🏷️</span>
                </div>
              )}
              <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 truncate">{cat.name}</span>
              <span className="text-[9px] text-gray-400 shrink-0">#{idx + 1}</span>
              <button
                onClick={() => handleToggle(cat.id, false)}
                className="p-0.5 text-red-400 hover:text-red-600 shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {unselectedCats.length > 0 && (
        <div className="space-y-1 mt-2">
          <span className="text-[10px] text-gray-500 dark:text-gray-500">Disponibles</span>
          <div className="max-h-40 overflow-y-auto space-y-1 rounded border border-gray-200 dark:border-gray-700 p-1">
            {unselectedCats.map((cat) => (
              <label
                key={cat.id}
                className="flex items-center gap-2 p-1 rounded hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer"
              >
                <Checkbox
                  checked={false}
                  onCheckedChange={(checked) => handleToggle(cat.id, !!checked)}
                />
                {cat.image_url ? (
                  <img src={cat.image_url} alt={cat.name} className="w-5 h-5 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
                    <span className="text-[9px]">🏷️</span>
                  </div>
                )}
                <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{cat.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {categories.length === 0 && (
        <p className="text-[10px] text-gray-400 text-center py-2">No hay categorías creadas</p>
      )}

      <p className="text-[9px] text-gray-400">
        {selectedIds.length === 0
          ? 'Sin selección: se muestran todas las categorías'
          : 'Arrastra para reordenar. Solo se mostrarán las seleccionadas.'}
      </p>
    </div>
  );
}

// ============================================================
// BRANDS ITEMS EDITOR (inline brand logo manager)
// ============================================================

function BrandsItemsEditor({
  items,
  onChange,
}: {
  items: BrandItem[];
  onChange: (items: BrandItem[]) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Asignar id a items que no lo tengan
  useEffect(() => {
    const hasEmpty = items.some((item) => !item.id);
    if (hasEmpty) {
      onChange(items.map((item) => item.id ? item : { ...item, id: crypto.randomUUID() }));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddLogo = (url: string) => {
    const newItem: BrandItem = {
      id: crypto.randomUUID(),
      name: '',
      logo_url: url,
    };
    onChange([...items, newItem]);
    setExpandedId(newItem.id);
  };

  const handleUpdate = (id: string, updates: Partial<BrandItem>) => {
    onChange(items.map((b) => (b.id === id ? { ...b, ...updates } : b)));
  };

  const handleRemove = (id: string) => {
    onChange(items.filter((b) => b.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
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
    <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700/50">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-gray-500 dark:text-gray-400">
          Marcas ({items.length})
        </Label>
        <button
          onClick={() => setShowPicker(true)}
          className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
        >
          <Plus className="h-3 w-3" /> Agregar
        </button>
      </div>

      {items.length > 0 ? (
        <div className="space-y-1">
          {items.map((brand, idx) => (
            <div
              key={brand.id || `brand-${idx}`}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              className={cn(
                'rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/5 overflow-hidden',
                dragIdx === idx && 'opacity-50'
              )}
            >
              <div
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5"
                onClick={() => setExpandedId(expandedId === brand.id ? null : brand.id)}
              >
                <GripVertical className="h-3 w-3 text-gray-400 shrink-0 cursor-grab" />
                {brand.logo_url ? (
                  <img src={brand.logo_url} alt={brand.name} className="h-6 w-10 object-contain shrink-0 rounded" />
                ) : (
                  <div className="h-6 w-10 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center shrink-0">
                    <span className="text-[9px]">🏢</span>
                  </div>
                )}
                <span className="text-[11px] flex-1 truncate text-gray-700 dark:text-gray-300">
                  {brand.name || 'Sin nombre'}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemove(brand.id); }}
                  className="p-0.5 hover:text-red-500 text-gray-400"
                >
                  <X className="h-3 w-3" />
                </button>
                {expandedId === brand.id ? (
                  <ChevronUp className="h-3 w-3 text-gray-400" />
                ) : (
                  <ChevronDown className="h-3 w-3 text-gray-400" />
                )}
              </div>
              {expandedId === brand.id && (
                <div className="px-2 pb-2 space-y-1.5 border-t border-gray-100 dark:border-gray-700/50">
                  <div className="mt-1.5">
                    <ImageFieldPicker
                      value={brand.logo_url || ''}
                      onChange={(url) => handleUpdate(brand.id, { logo_url: url })}
                    />
                  </div>
                  <Input
                    value={brand.name}
                    onChange={(e) => handleUpdate(brand.id, { name: e.target.value })}
                    placeholder="Nombre de la marca"
                    className="h-7 text-[11px] bg-white dark:bg-white/5 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white"
                  />
                  <Input
                    value={brand.url || ''}
                    onChange={(e) => handleUpdate(brand.id, { url: e.target.value })}
                    placeholder="URL (opcional) ej: https://marca.com"
                    className="h-7 text-[11px] bg-white dark:bg-white/5 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center py-2">
          Sin marcas. Agrega logos de tus marcas asociadas.
        </p>
      )}

      <ImagePickerDialog
        open={showPicker}
        onOpenChange={setShowPicker}
        onSelect={handleAddLogo}
        title="Agregar logo de marca"
      />
    </div>
  );
}

// ============================================================
// SECTION SPACING EDITOR (padding & margin for all sections)
// ============================================================

const SPACING_OPTIONS = [
  { value: 'none', label: 'Ninguno' },
  { value: 'xs', label: 'Muy poco' },
  { value: 'sm', label: 'Pequeño' },
  { value: 'md', label: 'Mediano' },
  { value: 'lg', label: 'Grande' },
  { value: 'xl', label: 'Muy grande' },
];

function SectionSpacingEditor({
  paddingTop,
  paddingBottom,
  paddingX,
  marginTop,
  marginBottom,
  onChange,
}: {
  paddingTop: string;
  paddingBottom: string;
  paddingX: string;
  marginTop: string;
  marginBottom: string;
  onChange: (key: string, value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="pt-2 border-t border-gray-200 dark:border-gray-700/50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full text-left"
      >
        <Layout className="h-3 w-3 text-gray-400" />
        <span className="text-[11px] text-gray-500 dark:text-gray-400 flex-1">Espaciado</span>
        {isOpen ? (
          <ChevronUp className="h-3 w-3 text-gray-400" />
        ) : (
          <ChevronDown className="h-3 w-3 text-gray-400" />
        )}
      </button>

      {isOpen && (
        <div className="space-y-2 mt-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-gray-400 block mb-0.5">Padding arriba</label>
              <Select value={paddingTop} onValueChange={(v) => onChange('padding_top', v)}>
                <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPACING_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-[11px]">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[9px] text-gray-400 block mb-0.5">Padding abajo</label>
              <Select value={paddingBottom} onValueChange={(v) => onChange('padding_bottom', v)}>
                <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPACING_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-[11px]">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-[9px] text-gray-400 block mb-0.5">Padding horizontal</label>
            <Select value={paddingX} onValueChange={(v) => onChange('padding_x', v)}>
              <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SPACING_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-[11px]">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-gray-400 block mb-0.5">Margen arriba</label>
              <Select value={marginTop} onValueChange={(v) => onChange('margin_top', v)}>
                <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPACING_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-[11px]">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[9px] text-gray-400 block mb-0.5">Margen abajo</label>
              <Select value={marginBottom} onValueChange={(v) => onChange('margin_bottom', v)}>
                <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPACING_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-[11px]">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
