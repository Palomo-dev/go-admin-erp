'use client';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/utils/Utils';
import {
  Users,
  CalendarOff,
  Clock,
  ClipboardCheck,
  DollarSign,
  Wallet,
} from 'lucide-react';

export interface HRMKPIs {
  activeEmployees: number;
  absencesToday: number;
  shiftsToday: number;
  pendingTimesheets: number;
  payrollInProcess: number;
  activeLoans: number;
}

interface HRMKPICardsProps {
  kpis: HRMKPIs;
  isLoading?: boolean;
}

interface KPICardData {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  darkBgColor: string;
}

export function HRMKPICards({ kpis, isLoading }: HRMKPICardsProps) {
  const cards: KPICardData[] = [
    {
      title: 'Empleados Activos',
      value: kpis.activeEmployees,
      icon: <Users className="h-6 w-6" />,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100',
      darkBgColor: 'dark:bg-blue-900/30',
    },
    {
      title: 'Ausencias Hoy',
      value: kpis.absencesToday,
      icon: <CalendarOff className="h-6 w-6" />,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100',
      darkBgColor: 'dark:bg-orange-900/30',
    },
    {
      title: 'Turnos Hoy',
      value: kpis.shiftsToday,
      icon: <Clock className="h-6 w-6" />,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100',
      darkBgColor: 'dark:bg-green-900/30',
    },
    {
      title: 'Timesheets Pendientes',
      value: kpis.pendingTimesheets,
      icon: <ClipboardCheck className="h-6 w-6" />,
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-100',
      darkBgColor: 'dark:bg-yellow-900/30',
    },
    {
      title: 'Nómina en Proceso',
      value: kpis.payrollInProcess,
      icon: <DollarSign className="h-6 w-6" />,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100',
      darkBgColor: 'dark:bg-purple-900/30',
    },
    {
      title: 'Préstamos Activos',
      value: kpis.activeLoans,
      icon: <Wallet className="h-6 w-6" />,
      color: 'text-cyan-600 dark:text-cyan-400',
      bgColor: 'bg-cyan-100',
      darkBgColor: 'dark:bg-cyan-900/30',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-lg mb-3" />
              <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
              <div className="h-8 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
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
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
        >
          <CardContent className="p-4">
            <div
              className={cn(
                'h-10 w-10 rounded-lg flex items-center justify-center mb-3',
                card.bgColor,
                card.darkBgColor
              )}
            >
              <span className={card.color}>{card.icon}</span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
              {card.title}
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {card.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default HRMKPICards;
