'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatCurrency, formatDate } from '@/utils/Utils';
import {
  DollarSign,
  Calendar,
  Users,
  CheckCircle,
  Clock,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

export interface PayrollPeriodInfo {
  id: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string | null;
  status: string;
  totalEmployees: number | null;
  totalNet: number | null;
}

export interface PayrollRunInfo {
  id: string;
  runNumber: number;
  executedAt: string;
  status: string;
  isFinal: boolean;
}

interface HRMPayrollStatusProps {
  currentPeriod: PayrollPeriodInfo | null;
  recentRuns: PayrollRunInfo[];
  isLoading?: boolean;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: {
    label: 'Borrador',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    icon: <Clock className="h-3 w-3" />,
  },
  processing: {
    label: 'Procesando',
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    icon: <Clock className="h-3 w-3" />,
  },
  pending_approval: {
    label: 'Pendiente Aprobación',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    icon: <AlertCircle className="h-3 w-3" />,
  },
  approved: {
    label: 'Aprobado',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  closed: {
    label: 'Cerrado',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  completed: {
    label: 'Completado',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  failed: {
    label: 'Fallido',
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

export function HRMPayrollStatus({
  currentPeriod,
  recentRuns,
  isLoading,
}: HRMPayrollStatusProps) {
  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base text-gray-900 dark:text-white">
            <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
            Estado de Nómina
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-6 pt-0">
          <div className="animate-pulse h-20 sm:h-24 bg-gray-100 dark:bg-gray-700 rounded-lg" />
          <div className="animate-pulse h-12 sm:h-16 bg-gray-100 dark:bg-gray-700 rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!currentPeriod) {
    return (
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base text-gray-900 dark:text-white">
            <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
            Estado de Nómina
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0">
          <div className="flex flex-col items-center justify-center py-6 sm:py-8 text-center">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-2 sm:mb-3">
              <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No hay períodos de nómina configurados
            </p>
            <Link href="/app/hrm/nomina/periodos/nuevo">
              <Button variant="outline" size="sm" className="mt-3 text-xs sm:text-sm border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                Crear Período
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const periodStatus = statusConfig[currentPeriod.status] || statusConfig.draft;

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between p-3 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-sm sm:text-base text-gray-900 dark:text-white">
          <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
          Estado de Nómina
        </CardTitle>
        <Link href="/app/hrm/nomina">
          <Button variant="ghost" size="sm" className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20">
            Ver todo
            <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-6 pt-0">
        {/* Período Actual */}
        <div className="p-3 sm:p-4 rounded-lg bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between mb-2 sm:mb-3 gap-2">
            <h4 className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-white truncate">
              {currentPeriod.name || 'Período Actual'}
            </h4>
            <Badge className={cn('flex items-center gap-1 text-[10px] sm:text-xs shrink-0', periodStatus.color)}>
              {periodStatus.icon}
              {periodStatus.label}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Calendar className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400 dark:text-gray-500 shrink-0" />
              <span className="text-gray-600 dark:text-gray-300 truncate">
                {formatDate(currentPeriod.periodStart)} - {formatDate(currentPeriod.periodEnd)}
              </span>
            </div>
            {currentPeriod.paymentDate && (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400 dark:text-gray-500 shrink-0" />
                <span className="text-gray-600 dark:text-gray-300 truncate">
                  Pago: {formatDate(currentPeriod.paymentDate)}
                </span>
              </div>
            )}
            {currentPeriod.totalEmployees && (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Users className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400 dark:text-gray-500 shrink-0" />
                <span className="text-gray-600 dark:text-gray-300">
                  {currentPeriod.totalEmployees} empleados
                </span>
              </div>
            )}
            {currentPeriod.totalNet && (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400 dark:text-gray-500 shrink-0" />
                <span className="text-gray-600 dark:text-gray-300 font-medium">
                  {formatCurrency(currentPeriod.totalNet)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Últimas Ejecuciones */}
        {recentRuns.length > 0 && (
          <div>
            <h4 className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              Últimas Ejecuciones
            </h4>
            <div className="space-y-1.5 sm:space-y-2">
              {recentRuns.slice(0, 3).map((run) => {
                const runStatus = statusConfig[run.status] || statusConfig.draft;
                return (
                  <div
                    key={run.id}
                    className="flex items-center justify-between p-1.5 sm:p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-xs sm:text-sm"
                  >
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span className="text-gray-600 dark:text-gray-300">
                        Run #{run.runNumber}
                      </span>
                      {run.isFinal && (
                        <Badge variant="outline" className="text-[10px] sm:text-xs border-gray-300 dark:border-gray-600">
                          Final
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span className="text-gray-400 dark:text-gray-500 text-[10px] sm:text-xs hidden xs:inline">
                        {formatDate(run.executedAt)}
                      </span>
                      <Badge className={cn('text-[10px] sm:text-xs', runStatus.color)}>
                        {runStatus.label}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default HRMPayrollStatus;
