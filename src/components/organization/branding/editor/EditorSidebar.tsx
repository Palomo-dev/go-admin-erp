'use client';

import { useState } from 'react';
import ImagePickerDialog from '@/components/common/ImagePickerDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
} from 'lucide-react';
import { cn } from '@/utils/Utils';
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
}: EditorSidebarProps) {
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
          Secciones de la página
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
            <span className="flex-1 text-left font-medium text-gray-700 dark:text-gray-200">Configuración del Tema</span>
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
            <span className="flex-1 text-left font-medium text-gray-700 dark:text-gray-200">SEO de la Página</span>
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
          Agregar sección
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
  onDragStart,
  onDragOver,
  onDragEnd,
}: SectionListItemProps) {
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
              <Label className="text-xs text-gray-500 dark:text-gray-400">Variante</Label>
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
            </div>
          ))}

          {/* Hero Booking Switch */}
          {section.section_type === 'hero' && (
            <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700/50">
              <Label className="text-xs text-gray-500 dark:text-gray-400">Buscador de reservas</Label>
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

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700/50">
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisibility(!section.is_visible);
                }}
                className="p-1 rounded hover:bg-white/10 transition-colors"
                title={section.is_visible ? 'Ocultar sección' : 'Mostrar sección'}
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
              title="Eliminar sección"
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

// ============================================================
// IMAGE FIELD PICKER (inline image selector with ImagePickerDialog)
// ============================================================

function ImageFieldPicker({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <>
      {value ? (
        <div className="relative group rounded-md overflow-hidden border border-gray-300 dark:border-gray-600">
          <img
            src={value}
            alt="Imagen"
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
          <span className="text-[10px]">Seleccionar imagen</span>
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
          Imágenes ({items.length})
        </Label>
        <button
          onClick={() => setShowPicker(true)}
          className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
        >
          <Plus className="h-3 w-3" /> Agregar
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
          Sin imágenes. Haz clic en Agregar.
        </p>
      )}

      <ImagePickerDialog
        open={showPicker}
        onOpenChange={setShowPicker}
        onSelect={handleAddImage}
        title="Agregar imagen a la galería"
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
          Testimonios ({items.length})
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
          {items.map((t) => (
            <div
              key={t.id}
              className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/5 overflow-hidden"
            >
              <div
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5"
                onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
              >
                <MessageSquareQuote className="h-3 w-3 text-gray-400 shrink-0" />
                <span className="text-[11px] flex-1 truncate text-gray-700 dark:text-gray-300">
                  {t.name || 'Sin nombre'}
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
                    placeholder="Nombre"
                    className="h-7 text-[11px] mt-1.5 bg-white dark:bg-white/5 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white"
                  />
                  <Input
                    value={t.company || ''}
                    onChange={(e) => handleUpdate(t.id, { company: e.target.value })}
                    placeholder="Empresa (opcional)"
                    className="h-7 text-[11px] bg-white dark:bg-white/5 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white"
                  />
                  <Textarea
                    value={t.content}
                    onChange={(e) => handleUpdate(t.id, { content: e.target.value })}
                    placeholder="Testimonio..."
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
          Sin testimonios. Haz clic en Agregar.
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
          Preguntas ({items.length})
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
                  {f.question || 'Sin pregunta'}
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
                    placeholder="Pregunta"
                    className="h-7 text-[11px] mt-1.5 bg-white dark:bg-white/5 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white"
                  />
                  <Textarea
                    value={f.answer}
                    onChange={(e) => handleUpdate(f.id, { answer: e.target.value })}
                    placeholder="Respuesta"
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
          Sin preguntas. Haz clic en Agregar.
        </p>
      )}
    </div>
  );
}
