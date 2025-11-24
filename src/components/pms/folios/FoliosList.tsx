'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, User, DollarSign, Calendar, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Folio } from '@/lib/services/foliosService';

interface FoliosListProps {
  folios: Folio[];
  onViewDetails: (folio: Folio) => void;
}

const getStatusInfo = (status: string) => {
  switch (status) {
    case 'open':
      return {
        label: 'Abierto',
        color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      };
    case 'closed':
      return {
        label: 'Cerrado',
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
      };
    default:
      return {
        label: status,
        color: 'bg-gray-100 text-gray-800',
      };
  }
};

export function FoliosList({ folios, onViewDetails }: FoliosListProps) {
  if (folios.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="h-16 w-16 text-gray-400 dark:text-gray-600 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          No hay folios
        </h3>
        <p className="text-gray-600 dark:text-gray-400 max-w-sm">
          No se encontraron folios con los filtros seleccionados.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {folios.map((folio) => {
        const statusInfo = getStatusInfo(folio.status);
        const customerName = folio.reservations?.customers
          ? `${folio.reservations.customers.first_name} ${folio.reservations.customers.last_name}`
          : 'Sin reserva';

        return (
          <Card key={folio.id} className="p-5 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Folio #{folio.id.slice(0, 8)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onViewDetails(folio)}
                title="Ver Detalle"
              >
                <Eye className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <User className="h-4 w-4 flex-shrink-0" />
                <span>{customerName}</span>
              </div>

              {folio.reservations?.customers?.email && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 text-xs">
                  <span className="ml-6">{folio.reservations.customers.email}</span>
                </div>
              )}

              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <Calendar className="h-4 w-4 flex-shrink-0" />
                <span>
                  Creado: {format(new Date(folio.created_at), 'dd MMM yyyy', { locale: es })}
                </span>
              </div>

              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      Balance:
                    </span>
                  </div>
                  <span
                    className={`text-lg font-bold ${
                      folio.balance > 0
                        ? 'text-red-600 dark:text-red-400'
                        : folio.balance < 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    ${Math.abs(folio.balance).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
