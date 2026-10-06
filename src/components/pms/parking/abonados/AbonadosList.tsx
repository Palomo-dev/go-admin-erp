'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Car, 
  Calendar, 
  User, 
  MoreVertical,
  Edit,
  XCircle
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ParkingPass } from '@/lib/services/parkingService';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useTranslations } from 'next-intl';

interface AbonadosListProps {
  passes: ParkingPass[];
  onEdit: (pass: ParkingPass) => void;
  onCancel: (pass: ParkingPass) => void;
}

const STATUS_CONFIG: Record<string, { className: string }> = {
  active: { className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  expired: { className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  cancelled: { className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
  suspended: { className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
};

export function AbonadosList({ passes, onEdit, onCancel }: AbonadosListProps) {
  const t = useTranslations('pmsParking');
  const formatDate = (dateStr: string) => {
    return formatPlainDate(dateStr, { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Moneda base de la organización (la reserva/abono no tiene moneda propia).
  const { formatear: formatCurrency } = useMonedaOrganizacion();

  const getDaysRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const today = new Date();
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  if (passes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Car className="h-16 w-16 text-gray-400 dark:text-gray-500 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          {t('abonadosList.noHayAbonadosRegistrados')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {t('abonadosList.creaNuevoPaseEstacionamiento')}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {passes.map((pass) => {
        const statusConfig = STATUS_CONFIG[pass.status];
        const daysRemaining = getDaysRemaining(pass.end_date);
        const isExpiringSoon = pass.status === 'active' && daysRemaining <= 7 && daysRemaining > 0;

        // Obtener placas de vehículos
        const vehiclePlates = pass.vehicles?.map(v => v.vehicle?.plate).filter(Boolean) || [];
        const primaryPlate = pass.vehicles?.find(v => v.is_primary)?.vehicle?.plate;
        const displayPlate = primaryPlate || vehiclePlates[0] || t('sinVehiculo');

        return (
          <Card key={pass.id} className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Car className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-1">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">
                      {displayPlate}
                    </p>
                    {vehiclePlates.length > 1 && (
                      <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded">
                        +{vehiclePlates.length - 1}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {pass.pass_type?.name || pass.plan_name}
                  </p>
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(pass)}>
                    <Edit className="h-4 w-4 mr-2" />
                    {t('passesTable.editar')}
                  </DropdownMenuItem>
                  {(pass.status === 'active' || pass.status === 'suspended') && (
                    <DropdownMenuItem 
                      onClick={() => onCancel(pass)}
                      className="text-red-600 dark:text-red-400"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      {t('abonadosList.cancelarPase')}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-2 mb-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <User className="h-4 w-4" />
                <span>{pass.customer?.full_name || t('passesTable.sinCliente')}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Calendar className="h-4 w-4" />
                <span>{formatDate(pass.start_date)} - {formatDate(pass.end_date)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={statusConfig.className}>
                  {t(`estadosPase.${pass.status in STATUS_CONFIG ? pass.status : 'active'}`)}
                </Badge>
                {isExpiringSoon && (
                  <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                    {t('passCard.dias', { daysRemaining })}
                  </Badge>
                )}
              </div>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {formatCurrency(pass.price)}
              </span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
