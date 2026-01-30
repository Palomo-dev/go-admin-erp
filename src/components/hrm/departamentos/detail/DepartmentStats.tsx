'use client';

import { Card, CardContent } from '@/components/ui/card';
import { cn, formatCurrency } from '@/utils/Utils';
import {
  Users,
  Briefcase,
  DollarSign,
  CalendarOff,
  ClipboardCheck,
  UserCheck,
} from 'lucide-react';

export interface DepartmentStatsData {
  totalEmployees: number;
  activeEmployees: number;
  totalPositions: number;
  avgSalary: number | null;
  pendingLeaves: number;
  pendingTimesheets: number;
}

interface DepartmentStatsProps {
  stats: DepartmentStatsData;
  isLoading?: boolean;
}

interface StatCardData {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  darkBgColor: string;
}

export function DepartmentStats({ stats, isLoading }: DepartmentStatsProps) {
  const cards: StatCardData[] = [
    {
      title: 'Total Empleados',
      value: stats.totalEmployees,
      icon: <Users className="h-5 w-5" />,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100',
      darkBgColor: 'dark:bg-blue-900/30',
    },
    {
      title: 'Empleados Activos',
      value: stats.activeEmployees,
      icon: <UserCheck className="h-5 w-5" />,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100',
      darkBgColor: 'dark:bg-green-900/30',
    },
    {
      title: 'Cargos',
      value: stats.totalPositions,
      icon: <Briefcase className="h-5 w-5" />,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100',
      darkBgColor: 'dark:bg-purple-900/30',
    },
    {
      title: 'Salario Promedio',
      value: stats.avgSalary ? formatCurrency(stats.avgSalary) : 'N/A',
      icon: <DollarSign className="h-5 w-5" />,
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-100',
      darkBgColor: 'dark:bg-emerald-900/30',
    },
    {
      title: 'Permisos Pendientes',
      value: stats.pendingLeaves,
      icon: <CalendarOff className="h-5 w-5" />,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100',
      darkBgColor: 'dark:bg-orange-900/30',
    },
    {
      title: 'Timesheets Pendientes',
      value: stats.pendingTimesheets,
      icon: <ClipboardCheck className="h-5 w-5" />,
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-100',
      darkBgColor: 'dark:bg-yellow-900/30',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse bg-white dark:bg-gray-800">
            <CardContent className="p-4">
              <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded-lg mb-2" />
              <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded mb-1" />
              <div className="h-6 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card, index) => (
        <Card
          key={index}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
        >
          <CardContent className="p-4">
            <div
              className={cn(
                'h-8 w-8 rounded-lg flex items-center justify-center mb-2',
                card.bgColor,
                card.darkBgColor
              )}
            >
              <span className={card.color}>{card.icon}</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              {card.title}
            </p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {card.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default DepartmentStats;
