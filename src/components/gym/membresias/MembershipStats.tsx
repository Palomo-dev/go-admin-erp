'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Snowflake, AlertTriangle, XCircle, TrendingUp } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Membership, getDaysRemaining } from '@/lib/services/gymService';

interface MembershipStatsProps {
  memberships: Membership[];
  isLoading?: boolean;
}

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
  onClick?: () => void;
}

function StatCard({ title, value, icon, color, subtitle, onClick }: StatCardProps) {
  return (
    <Card 
      className={cn(
        "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700",
        onClick && "cursor-pointer hover:shadow-md transition-shadow"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
            <p className={cn("text-2xl font-bold mt-1", color)}>{value}</p>
            {subtitle && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subtitle}</p>
            )}
          </div>
          <div className={cn("p-3 rounded-full", color.replace('text-', 'bg-').replace('-600', '-100').replace('-400', '-900/30'))}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function MembershipStats({ memberships, isLoading }: MembershipStatsProps) {
  const stats = React.useMemo(() => {
    const now = new Date();
    
    const active = memberships.filter(m => m.status === 'active' && new Date(m.end_date) >= now);
    const frozen = memberships.filter(m => m.status === 'frozen');
    const expired = memberships.filter(m => m.status === 'expired' || (m.status === 'active' && new Date(m.end_date) < now));
    const cancelled = memberships.filter(m => m.status === 'cancelled');
    const expiringIn7Days = memberships.filter(m => {
      if (m.status !== 'active') return false;
      const days = getDaysRemaining(m.end_date);
      return days >= 0 && days <= 7;
    });

    return {
      active: active.length,
      frozen: frozen.length,
      expired: expired.length,
      cancelled: cancelled.length,
      expiringSoon: expiringIn7Days.length
    };
  }, [memberships]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map(i => (
          <Card key={i} className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20 mb-2" />
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-12" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <StatCard
        title="Activas"
        value={stats.active}
        icon={<Users className="h-5 w-5 text-green-600 dark:text-green-400" />}
        color="text-green-600 dark:text-green-400"
      />
      <StatCard
        title="Por Vencer"
        value={stats.expiringSoon}
        icon={<AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />}
        color="text-yellow-600 dark:text-yellow-400"
        subtitle="Próximos 7 días"
      />
      <StatCard
        title="Congeladas"
        value={stats.frozen}
        icon={<Snowflake className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
        color="text-blue-600 dark:text-blue-400"
      />
      <StatCard
        title="Vencidas"
        value={stats.expired}
        icon={<TrendingUp className="h-5 w-5 text-red-600 dark:text-red-400" />}
        color="text-red-600 dark:text-red-400"
      />
      <StatCard
        title="Canceladas"
        value={stats.cancelled}
        icon={<XCircle className="h-5 w-5 text-gray-600 dark:text-gray-400" />}
        color="text-gray-600 dark:text-gray-400"
      />
    </div>
  );
}

export default MembershipStats;
