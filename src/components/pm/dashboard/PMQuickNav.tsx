'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  FolderKanban,
  Target,
  ClipboardList,
  Milestone,
  LayoutGrid,
  Calendar,
  BarChart3,
  Sparkles,
  ArrowRight,
  Plus,
} from 'lucide-react';

interface QuickNavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  description: string;
  color: string;
}

const navItems: QuickNavItem[] = [
  {
    label: 'Proyectos',
    href: '/app/pm/proyectos',
    icon: <FolderKanban className="h-5 w-5" />,
    description: 'Gestión de proyectos',
    color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  },
  {
    label: 'Metas',
    href: '/app/pm/metas',
    icon: <Target className="h-5 w-5" />,
    description: 'Metas y propuestas',
    color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  },
  {
    label: 'Tareas',
    href: '/app/pm/tareas',
    icon: <ClipboardList className="h-5 w-5" />,
    description: 'Gestión de tareas',
    color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  },
  {
    label: 'Kanban',
    href: '/app/pm/tareas?view=kanban',
    icon: <LayoutGrid className="h-5 w-5" />,
    description: 'Vista tablero',
    color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  },
  {
    label: 'Calendario',
    href: '/app/pm/tareas?view=calendar',
    icon: <Calendar className="h-5 w-5" />,
    description: 'Vista calendario',
    color: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400',
  },
  {
    label: 'IA Planner',
    href: '/app/pm/tareas?view=ai',
    icon: <Sparkles className="h-5 w-5" />,
    description: 'Planificación con IA',
    color: 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
  },
];

export function PMQuickNav() {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3">
      {navItems.map((item) => (
        <Link key={item.href} href={item.href}>
          <div className="group p-2.5 sm:p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all cursor-pointer h-full">
            <div className="flex flex-col items-center text-center gap-2">
              <div className={`p-2 rounded-lg ${item.color}`}>
                {item.icon}
              </div>
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {item.label}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
                  {item.description}
                </p>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function PMQuickActions() {
  return (
    <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
      <Link href="/app/pm/proyectos">
        <Button variant="default" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4 mr-1 sm:mr-2" />
          <span className="hidden xs:inline">Nuevo Proyecto</span>
        </Button>
      </Link>
      <Link href="/app/pm/tareas?view=kanban">
        <Button variant="outline" size="sm" className="border-gray-300 dark:border-gray-600">
          <LayoutGrid className="h-4 w-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">Kanban</span>
        </Button>
      </Link>
      <Link href="/app/pm/tareas?view=ai">
        <Button variant="outline" size="sm" className="border-purple-300 dark:border-purple-600 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20">
          <Sparkles className="h-4 w-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">IA Planner</span>
        </Button>
      </Link>
    </div>
  );
}
