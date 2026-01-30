'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Users, UserCheck, Moon, DollarSign } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';

interface GroupsStatsProps {
  totalGroups: number;
  activeGroups: number;
  totalRoomNights: number;
  totalRevenue: number;
  isLoading?: boolean;
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
          </div>
          <div className={`p-3 rounded-full ${color}`}>
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
            <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
          <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
}

export function GroupsStats({
  totalGroups,
  activeGroups,
  totalRoomNights,
  totalRevenue,
  isLoading = false,
}: GroupsStatsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        title="Total Grupos"
        value={totalGroups}
        icon={<Users className="h-5 w-5 text-blue-600" />}
        color="bg-blue-100 dark:bg-blue-900/30"
      />
      <StatCard
        title="Grupos Activos"
        value={activeGroups}
        icon={<UserCheck className="h-5 w-5 text-green-600" />}
        color="bg-green-100 dark:bg-green-900/30"
      />
      <StatCard
        title="Room Nights"
        value={totalRoomNights}
        icon={<Moon className="h-5 w-5 text-purple-600" />}
        color="bg-purple-100 dark:bg-purple-900/30"
      />
      <StatCard
        title="Ingresos Estimados"
        value={formatCurrency(totalRevenue)}
        icon={<DollarSign className="h-5 w-5 text-emerald-600" />}
        color="bg-emerald-100 dark:bg-emerald-900/30"
      />
    </div>
  );
}
