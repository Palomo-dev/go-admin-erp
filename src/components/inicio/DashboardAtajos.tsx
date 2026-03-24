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

export function DashboardAtajos({ activeModuleCodes }: DashboardAtajosProps) {
  const t = useTranslations('home.shortcuts');
  const filteredAtajos = activeModuleCodes
    ? atajos.filter(a => !a.moduleCode || activeModuleCodes.includes(a.moduleCode))
    : atajos;

  return (
    <div
      className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10 gap-2 sm:gap-3 overflow-x-auto"
    >
      {filteredAtajos.map((atajo) => {
        const Icon = atajo.icon;
        return (
          <Link
            key={atajo.href}
            href={atajo.href}
            className="flex flex-col items-center gap-1 sm:gap-1.5 p-2 sm:p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all group min-w-0"
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
