'use client';

import Link from 'next/link';
import {
  ShoppingCart,
  Package,
  DollarSign,
  Hotel,
  Users,
  BarChart3,
  Car,
  CalendarDays,
  UtensilsCrossed,
  Settings,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

const atajos = [
  {
    labelKey: 'pos' as const,
    href: '/app/pos',
    icon: ShoppingCart,
    color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    moduleCode: 'pos',
  },
  {
    labelKey: 'inventory' as const,
    href: '/app/inventario',
    icon: Package,
    color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    moduleCode: 'inventory',
  },
  {
    labelKey: 'finance' as const,
    href: '/app/finanzas',
    icon: DollarSign,
    color: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    moduleCode: 'finance',
  },
  {
    labelKey: 'hotel' as const,
    href: '/app/pms',
    icon: Hotel,
    color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    moduleCode: 'pms_hotel',
  },
  {
    labelKey: 'crm' as const,
    href: '/app/crm',
    icon: Users,
    color: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400',
    moduleCode: 'crm',
  },
  {
    labelKey: 'reports' as const,
    href: '/app/reportes',
    icon: BarChart3,
    color: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
    moduleCode: 'reports',
  },
  {
    labelKey: 'tables' as const,
    href: '/app/pos/mesas',
    icon: UtensilsCrossed,
    color: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
    moduleCode: 'pos',
  },
  {
    labelKey: 'parking' as const,
    href: '/app/parking',
    icon: Car,
    color: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400',
    moduleCode: 'parking',
  },
  {
    labelKey: 'calendar' as const,
    href: '/app/calendario',
    icon: CalendarDays,
    color: 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400',
    moduleCode: 'calendar',
  },
  {
    labelKey: 'config' as const,
    href: '/app/organizacion',
    icon: Settings,
    color: 'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400',
  },
];

interface DashboardAtajosProps {
  activeModuleCodes?: string[];
}

// Clases de columnas para móvil (deben ser strings completos para el JIT de
// Tailwind). Desde sm+ se usa auto-fit para llenar todo el ancho disponible.
const MOBILE_COLS_CLASS: Record<number, string> = {
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

// Clase para que la última card ocupe más columnas en móvil y llene la fila
// (se resetea en sm+ donde el auto-fit ya distribuye uniformemente).
// La clave es el número de columnas que ocupa la última card.
const MOBILE_SPAN_CLASS: Record<number, string> = {
  2: 'col-span-2 sm:col-span-1',
  3: 'col-span-3 sm:col-span-1',
};

/**
 * Calcula la cantidad de columnas óptima para móvil según el número de cards,
 * distribuyendo de forma que la última fila no quede con elementos sueltos
 * y angostos.
 *
 * Reglas (ejemplos del producto):
 *  - 7 cards → 3 columnas, la última se expande a 3 (3 + 3 + 1→span3)
 *  - 8 cards → 4 columnas (4 + 4, sin huecos)
 *  - 9 cards → 3 columnas (3 + 3 + 3, sin huecos)
 *  - 10 cards → 3 columnas, la última se expande a 3 (3 + 3 + 3 + 1→span3)
 *  - 5 cards → 3 columnas, la última se expande a 2 (3 + 1 + 1→span2 = 3)
 *  - 11 cards → 3 columnas, la última se expande a 2 (3+3+3 + 1 + 1→span2)
 *
 * `lastSpan` indica cuántas columnas ocupa la última card (0 = no expandir).
 */
function getMobileLayout(count: number): { cols: number; lastSpan: number } {
  if (count <= 0) return { cols: 3, lastSpan: 0 };
  // 4 columnas solo cuando calza exacto y hay suficientes cards para que no
  // queden demasiado angostas en móvil.
  if (count >= 8 && count % 4 === 0) return { cols: 4, lastSpan: 0 };
  // En 3 columnas, si la última fila no se completa, la última card se expande
  // para llenar el espacio restante:
  //  - residuo 1 → span 3 (ocupa toda la fila)
  //  - residuo 2 → span 2 (1 + 2 = 3, llena la fila)
  const residuo = count % 3;
  if (residuo === 1) return { cols: 3, lastSpan: 3 };
  if (residuo === 2) return { cols: 3, lastSpan: 2 };
  return { cols: 3, lastSpan: 0 };
}

export function DashboardAtajos({ activeModuleCodes }: DashboardAtajosProps) {
  const t = useTranslations('home.shortcuts');
  const filteredAtajos = activeModuleCodes
    ? atajos.filter(a => !a.moduleCode || activeModuleCodes.includes(a.moduleCode))
    : atajos;

  const { cols, lastSpan } = getMobileLayout(filteredAtajos.length);
  const mobileColsClass = MOBILE_COLS_CLASS[cols] ?? MOBILE_COLS_CLASS[3];
  const lastSpanClass = lastSpan > 0 ? (MOBILE_SPAN_CLASS[lastSpan] ?? '') : '';
  const lastIndex = filteredAtajos.length - 1;

  return (
    <div className={`grid ${mobileColsClass} sm:grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-2 sm:gap-3`}>
      {filteredAtajos.map((atajo, index) => {
        const Icon = atajo.icon;
        const isLastExpanded = lastSpan && index === lastIndex;
        return (
          <Link
            key={atajo.href}
            href={atajo.href}
            className={`flex flex-col items-center gap-1 sm:gap-1.5 p-2 sm:p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all group min-w-0 ${isLastExpanded ? lastSpanClass : ''}`}
          >
            <div className={`p-2 rounded-lg ${atajo.color} group-hover:scale-110 transition-transform`}>
              <Icon className="h-5 w-5" />
            </div>
            <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400 text-center leading-tight">
              {t(atajo.labelKey)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
