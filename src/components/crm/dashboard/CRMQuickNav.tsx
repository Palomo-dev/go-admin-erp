'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  MessageSquare,
  Target,
  Users,
  Megaphone,
  Activity,
  FileText,
  TrendingUp,
  DollarSign,
  ArrowRight,
  Filter,
  Settings,
  BarChart3,
  Fingerprint,
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
    label: 'Bandeja',
    href: '/app/crm/bandeja',
    icon: <MessageSquare className="h-5 w-5" />,
    description: 'Conversaciones',
    color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  },
  {
    label: 'Pipeline',
    href: '/app/crm/pipeline',
    icon: <Target className="h-5 w-5" />,
    description: 'Embudo de ventas',
    color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  },
  {
    label: 'Oportunidades',
    href: '/app/crm/oportunidades',
    icon: <DollarSign className="h-5 w-5" />,
    description: 'Listado y análisis',
    color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  {
    label: 'Pronóstico',
    href: '/app/crm/pronostico',
    icon: <TrendingUp className="h-5 w-5" />,
    description: 'Proyección de ventas',
    color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  },
  {
    label: 'Clientes',
    href: '/app/crm/clientes',
    icon: <Users className="h-5 w-5" />,
    description: 'Base de clientes',
    color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  },
  {
    label: 'Actividades',
    href: '/app/crm/actividades',
    icon: <Activity className="h-5 w-5" />,
    description: 'Seguimiento 360°',
    color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  },
  {
    label: 'Tareas',
    href: '/app/crm/tareas',
    icon: <FileText className="h-5 w-5" />,
    description: 'Gestión de tareas',
    color: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400',
  },
  {
    label: 'Segmentos',
    href: '/app/crm/segmentos',
    icon: <Filter className="h-5 w-5" />,
    description: 'Segmentación',
    color: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
  },
  {
    label: 'Campañas',
    href: '/app/crm/campanas',
    icon: <Megaphone className="h-5 w-5" />,
    description: 'Marketing',
    color: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400',
  },
  {
    label: 'Reportes',
    href: '/app/crm/reportes',
    icon: <BarChart3 className="h-5 w-5" />,
    description: 'Análisis y métricas',
    color: 'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',
  },
  {
    label: 'Identidades',
    href: '/app/crm/identidades',
    icon: <Fingerprint className="h-5 w-5" />,
    description: 'Omnicanal',
    color: 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
  },
  {
    label: 'Configuración',
    href: '/app/crm/configuracion',
    icon: <Settings className="h-5 w-5" />,
    description: 'Canales y reglas',
    color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
];

export function CRMQuickNav() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-3">
      {navItems.map((item) => (
        <Link key={item.href} href={item.href}>
          <div className="group p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all cursor-pointer h-full">
            <div className="flex flex-col items-center text-center gap-2">
              <div className={`p-2 rounded-lg ${item.color}`}>
                {item.icon}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
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

export function CRMQuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      <Link href="/app/crm/bandeja">
        <Button variant="default" size="sm" className="bg-blue-600 hover:bg-blue-700">
          <MessageSquare className="h-4 w-4 mr-2" />
          Bandeja
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </Link>
      <Link href="/app/crm/oportunidades/nuevo">
        <Button variant="outline" size="sm">
          <DollarSign className="h-4 w-4 mr-2" />
          Nueva Oportunidad
        </Button>
      </Link>
      <Link href="/app/crm/oportunidades">
        <Button variant="outline" size="sm">
          <Target className="h-4 w-4 mr-2" />
          Oportunidades
        </Button>
      </Link>
      <Link href="/app/crm/pronostico">
        <Button variant="outline" size="sm">
          <TrendingUp className="h-4 w-4 mr-2" />
          Pronóstico
        </Button>
      </Link>
    </div>
  );
}
