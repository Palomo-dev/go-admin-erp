'use client';

import { useMemo, useState } from 'react';
import * as LucideIcons from 'lucide-react';
import { Search, X, Check } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils/Utils';
import type { BaseFieldProps } from './types';

/**
 * Subconjunto curado de iconos Lucide organizados por categoría.
 * Se evita importar los ~1000 iconos para mantener el bundle ligero.
 */
const ICON_CATEGORIES: Record<string, string[]> = {
  General: ['Image', 'Images', 'Star', 'Heart', 'Award', 'Flag', 'Tag', 'Gift', 'Sparkles', 'Flame', 'Zap', 'Crown'],
  Comunicación: ['Mail', 'MessageSquareQuote', 'Phone', 'MessageCircle', 'Send', 'Megaphone', 'Bell', 'AtSign'],
  Usuarios: ['Users', 'User', 'UserCheck', 'UserPlus', 'Contact', 'Smile'],
  Comercio: ['ShoppingBag', 'ShoppingCart', 'CreditCard', 'Tag', 'Percent', 'Receipt', 'Wallet', 'Coins', 'DollarSign'],
  Layout: ['Layout', 'LayoutPanelLeft', 'LayoutGrid', 'Columns', 'Rows', 'AlignCenter', 'AlignLeft', 'AlignRight'],
  Media: ['Play', 'Video', 'Camera', 'Film', 'Mic', 'Headphones', 'Volume2'],
  Navegación: ['MapPin', 'Navigation', 'Compass', 'Route', 'Globe', 'Link', 'ExternalLink', 'ArrowRight', 'ChevronRight'],
  Acciones: ['MousePointerClick', 'Click', 'Hand', 'Search', 'Filter', 'Settings', 'Edit', 'Trash2', 'Plus', 'Check', 'X'],
  Tiempo: ['CalendarCheck', 'Calendar', 'Clock', 'Timer', 'Hourglass', 'CalendarDays'],
  Comida: ['UtensilsCrossed', 'Coffee', 'Pizza', 'IceCream', 'Wine', 'Cake'],
  Negocios: ['BedDouble', 'Building2', 'Store', 'Briefcase', 'TrendingUp', 'BarChart3', 'PieChart', 'FileText', 'Newspaper', 'BookOpen'],
  Soporte: ['HelpCircle', 'Info', 'LifeBuoy', 'ShieldCheck', 'Lock', 'KeyRound'],
};

const ALL_ICON_NAMES = Object.values(ICON_CATEGORIES).flat();

/** Resuelve un icono Lucide por nombre. */
function getIcon(name: string): LucideIcons.LucideIcon | null {
  const Icon = (LucideIcons as unknown as Record<string, LucideIcons.LucideIcon>)[name];
  return Icon || null;
}

/** Buscador de iconos Lucide con preview en grid, categorías y "sin icono". */
export default function IconField({ value, onChange }: BaseFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<string>('General');
  const current = (value as string) || '';
  const CurrentIcon = current ? getIcon(current) : null;

  const filtered = useMemo(() => {
    const list = activeCat === 'Todos' ? ALL_ICON_NAMES : ICON_CATEGORIES[activeCat] || [];
    if (!query) return list;
    return list.filter((n) => n.toLowerCase().includes(query.toLowerCase()));
  }, [activeCat, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 w-full h-8 px-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-white/5 text-xs text-gray-800 dark:text-white hover:bg-gray-50 dark:hover:bg-white/5"
        >
          {CurrentIcon ? (
            <CurrentIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          ) : (
            <span className="text-gray-400 text-[11px]">Sin icono</span>
          )}
          <span className="flex-1 text-left truncate text-[11px] text-gray-500 dark:text-gray-400">
            {current || 'Seleccionar...'}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar icono..."
          className="h-7 text-xs mb-2"
        />
        <div className="flex flex-wrap gap-1 mb-2">
          <button
            type="button"
            onClick={() => setActiveCat('Todos')}
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded',
              activeCat === 'Todos'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300',
            )}
          >
            Todos
          </button>
          {Object.keys(ICON_CATEGORIES).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCat(cat)}
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded',
                activeCat === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300',
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Sin icono */}
        <button
          type="button"
          onClick={() => {
            onChange('');
            setOpen(false);
          }}
          className="flex items-center gap-1.5 w-full text-[11px] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 rounded px-1 py-1 mb-1"
        >
          <X className="h-3 w-3" /> Sin icono
        </button>

        <div className="grid grid-cols-6 gap-1 max-h-40 overflow-y-auto">
          {filtered.map((name) => {
            const Icon = getIcon(name);
            if (!Icon) return null;
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                }}
                className={cn(
                  'h-8 w-8 rounded flex items-center justify-center border transition-colors relative',
                  current === name
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                    : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5',
                )}
                title={name}
              >
                <Icon className="h-4 w-4" />
                {current === name && (
                  <Check className="h-2.5 w-2.5 absolute -top-1 -right-1 text-blue-600 bg-white dark:bg-gray-800 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <p className="text-[10px] text-gray-400 text-center py-2">Sin resultados</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
