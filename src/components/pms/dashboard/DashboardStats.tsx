'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { 
  LogIn, 
  LogOut, 
  Percent, 
  DoorOpen, 
  Sparkles, 
  Wrench,
  Building2
} from 'lucide-react';
import { cn } from '@/utils/Utils';

interface DashboardStatsProps {
  arrivalsToday: number;
  departuresToday: number;
  occupancy: number;
  available: number;
  cleaning: number;
  maintenance: number;
  totalSpaces: number;
  isLoading?: boolean;
}

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}

function StatCard({ title, value, icon, color, subtitle }: StatCardProps) {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
            {subtitle && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subtitle}</p>
            )}
          </div>
          <div className={cn('p-3 rounded-full', color)}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
          <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardStats({
  arrivalsToday,
  departuresToday,
  occupancy,
  available,
  cleaning,
  maintenance,
  totalSpaces,
  isLoading = false,
}: DashboardStatsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
      <StatCard
        title="Llegadas Hoy"
        value={arrivalsToday}
        icon={<LogIn className="h-5 w-5 text-green-600" />}
        color="bg-green-100 dark:bg-green-900/30"
      />
      <StatCard
        title="Salidas Hoy"
        value={departuresToday}
        icon={<LogOut className="h-5 w-5 text-blue-600" />}
        color="bg-blue-100 dark:bg-blue-900/30"
      />
      <StatCard
        title="Ocupación"
        value={`${occupancy}%`}
        icon={<Percent className="h-5 w-5 text-purple-600" />}
        color="bg-purple-100 dark:bg-purple-900/30"
      />
      <StatCard
        title="Disponibles"
        value={available}
        icon={<DoorOpen className="h-5 w-5 text-emerald-600" />}
        color="bg-emerald-100 dark:bg-emerald-900/30"
      />
      <StatCard
        title="Limpieza"
        value={cleaning}
        icon={<Sparkles className="h-5 w-5 text-yellow-600" />}
        color="bg-yellow-100 dark:bg-yellow-900/30"
      />
      <StatCard
        title="Mantenimiento"
        value={maintenance}
        icon={<Wrench className="h-5 w-5 text-red-600" />}
        color="bg-red-100 dark:bg-red-900/30"
      />
      <StatCard
        title="Total Espacios"
        value={totalSpaces}
        icon={<Building2 className="h-5 w-5 text-gray-600" />}
        color="bg-gray-100 dark:bg-gray-700"
      />
    </div>
  );
}
