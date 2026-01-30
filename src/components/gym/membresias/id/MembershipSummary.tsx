'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar, 
  Clock, 
  CreditCard, 
  CheckCircle, 
  Snowflake,
  TrendingUp,
  DollarSign,
  Activity
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import { formatDate, formatCurrency } from '@/utils/Utils';
import { Membership, getDaysRemaining, getMembershipStatusColor, getMembershipStatusLabel } from '@/lib/services/gymService';

interface MembershipSummaryProps {
  membership: Membership;
  totalCheckins?: number;
  totalFreezes?: number;
  totalPayments?: number;
  isLoading?: boolean;
}

interface StatItemProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
  color?: string;
}

function StatItem({ icon, label, value, subValue, color }: StatItemProps) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
      <div className={cn("p-2 rounded-lg", color || "bg-blue-100 dark:bg-blue-900/30")}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="font-semibold text-gray-900 dark:text-white">{value}</p>
        {subValue && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{subValue}</p>
        )}
      </div>
    </div>
  );
}

export function MembershipSummary({ 
  membership, 
  totalCheckins = 0,
  totalFreezes = 0,
  totalPayments = 0,
  isLoading 
}: MembershipSummaryProps) {
  const daysRemaining = getDaysRemaining(membership.end_date);
  const isExpired = daysRemaining < 0;
  const isExpiringSoon = daysRemaining >= 0 && daysRemaining <= 7;
  const plan = membership.membership_plans;

  const startDate = new Date(membership.start_date);
  const endDate = new Date(membership.end_date);
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysUsed = totalDays - Math.max(0, daysRemaining);
  const usagePercent = totalDays > 0 ? Math.round((daysUsed / totalDays) * 100) : 0;

  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <div className="animate-pulse h-6 bg-gray-200 dark:bg-gray-700 rounded w-40" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="animate-pulse">
                <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" />
            Resumen de Membresía
          </CardTitle>
          <Badge className={getMembershipStatusColor(membership.status)}>
            {getMembershipStatusLabel(membership.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Barra de progreso de uso */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Uso del período</span>
            <span className="font-medium text-gray-900 dark:text-white">{usagePercent}%</span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full rounded-full transition-all",
                isExpired ? "bg-red-500" :
                isExpiringSoon ? "bg-yellow-500" :
                "bg-blue-500"
              )}
              style={{ width: `${Math.min(100, usagePercent)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{formatDate(membership.start_date)}</span>
            <span>{formatDate(membership.end_date)}</span>
          </div>
        </div>

        {/* Estadísticas principales */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatItem
            icon={<Calendar className={cn(
              "h-4 w-4",
              isExpired ? "text-red-600 dark:text-red-400" :
              isExpiringSoon ? "text-yellow-600 dark:text-yellow-400" :
              "text-green-600 dark:text-green-400"
            )} />}
            label="Días restantes"
            value={isExpired ? `${Math.abs(daysRemaining)} vencidos` : daysRemaining}
            subValue={`de ${totalDays} días`}
            color={
              isExpired ? "bg-red-100 dark:bg-red-900/30" :
              isExpiringSoon ? "bg-yellow-100 dark:bg-yellow-900/30" :
              "bg-green-100 dark:bg-green-900/30"
            }
          />
          
          <StatItem
            icon={<CheckCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
            label="Check-ins"
            value={totalCheckins}
            subValue="registrados"
            color="bg-blue-100 dark:bg-blue-900/30"
          />
          
          <StatItem
            icon={<Snowflake className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />}
            label="Congelamientos"
            value={totalFreezes}
            subValue="veces"
            color="bg-cyan-100 dark:bg-cyan-900/30"
          />
          
          <StatItem
            icon={<DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
            label="Pagos"
            value={totalPayments}
            subValue="registrados"
            color="bg-emerald-100 dark:bg-emerald-900/30"
          />
        </div>

        {/* Info del plan */}
        {plan && (
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Plan: {plan.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Duración: {plan.duration_days} días • Precio: {formatCurrency(plan.price)}
                </p>
              </div>
              {membership.access_code && (
                <div className="text-right">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Código de acceso</p>
                  <p className="font-mono font-semibold text-gray-900 dark:text-white">
                    {membership.access_code}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default MembershipSummary;
