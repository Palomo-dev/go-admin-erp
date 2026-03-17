'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Search,
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
  Layout,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import {
  SECTION_CATALOG,
  type SectionTypeDefinition,
} from '@/lib/services/websitePageBuilderService';

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

interface AddSectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (sectionType: string, sectionVariant: string) => void;
  existingSectionTypes: string[];
}

export default function AddSectionDialog({
  open,
  onOpenChange,
  onAdd,
  existingSectionTypes,
}: AddSectionDialogProps) {
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<SectionTypeDefinition | null>(null);

  const filtered = SECTION_CATALOG.filter(
    (s) =>
      s.label.toLowerCase().includes(search.toLowerCase()) ||
      s.type.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectType = (def: SectionTypeDefinition) => {
    if (def.variants.length === 1) {
      onAdd(def.type, def.variants[0].id);
      handleClose();
    } else {
      setSelectedType(def);
    }
  };

  const handleSelectVariant = (variantId: string) => {
    if (selectedType) {
      onAdd(selectedType.type, variantId);
      handleClose();
    }
  };

  const handleClose = () => {
    setSearch('');
    setSelectedType(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {selectedType ? `${selectedType.label} — Elegir variante` : 'Agregar sección'}
          </DialogTitle>
          <DialogDescription>
            {selectedType
              ? 'Selecciona cómo quieres que se vea esta sección'
              : 'Elige el tipo de sección que deseas agregar a la página'}
          </DialogDescription>
        </DialogHeader>

        {!selectedType ? (
          <>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar secciones..."
                className="pl-9"
              />
            </div>

            {/* Section Types Grid */}
            <div className="flex-1 overflow-y-auto space-y-1 mt-2">
              {filtered.map((def) => {
                const IconComponent = ICON_MAP[def.icon] || Layout;
                const alreadyExists = existingSectionTypes.includes(def.type);

                return (
                  <button
                    key={def.type}
                    onClick={() => handleSelectType(def)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors',
                      'hover:bg-gray-100 dark:hover:bg-gray-800',
                      'border border-transparent hover:border-gray-200 dark:hover:border-gray-700'
                    )}
                  >
                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 shrink-0">
                      <IconComponent className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium dark:text-white">{def.label}</p>
                        {alreadyExists && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Ya existe
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {def.description}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">
                      {def.variants.length} variante{def.variants.length > 1 ? 's' : ''}
                    </span>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-center text-sm text-gray-500 py-8">
                  No se encontraron secciones
                </p>
              )}
            </div>
          </>
        ) : (
          // Variant Selection
          <div className="space-y-2 mt-2">
            <button
              onClick={() => setSelectedType(null)}
              className="text-sm text-blue-600 hover:underline mb-2"
            >
              ← Volver a tipos
            </button>
            <div className="grid grid-cols-2 gap-2">
              {selectedType.variants.map((variant) => (
                <button
                  key={variant.id}
                  onClick={() => handleSelectVariant(variant.id)}
                  className={cn(
                    'p-4 rounded-lg border-2 text-left transition-all',
                    'hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20',
                    'border-gray-200 dark:border-gray-700'
                  )}
                >
                  <p className="text-sm font-medium dark:text-white">{variant.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {selectedType.type}/{variant.id}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
