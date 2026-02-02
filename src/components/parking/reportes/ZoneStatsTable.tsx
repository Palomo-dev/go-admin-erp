'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { MapPin } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { ZoneStats } from '@/lib/services/parkingReportService';

interface ZoneStatsTableProps {
  data: ZoneStats[];
  isLoading?: boolean;
}

export function ZoneStatsTable({ data, isLoading }: ZoneStatsTableProps) {
  const getOccupancyColor = (rate: number) => {
    if (rate >= 80) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    if (rate >= 50) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
          <MapPin className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          Estadísticas por Zona
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="animate-pulse text-gray-400">Cargando...</div>
          </div>
        ) : data.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-gray-400">
            No hay zonas configuradas
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-900/50">
                  <TableHead className="font-semibold">Zona</TableHead>
                  <TableHead className="font-semibold text-center">Sesiones</TableHead>
                  <TableHead className="font-semibold text-right">Ingresos</TableHead>
                  <TableHead className="font-semibold text-center">Prom. Duración</TableHead>
                  <TableHead className="font-semibold text-center">Ocupación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((zone) => (
                  <TableRow
                    key={zone.zone_id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <TableCell className="font-medium text-gray-900 dark:text-white">
                      {zone.zone_name}
                    </TableCell>
                    <TableCell className="text-center text-gray-600 dark:text-gray-300">
                      {zone.total_sessions.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-green-600 dark:text-green-400 font-medium">
                      {formatCurrency(zone.total_revenue)}
                    </TableCell>
                    <TableCell className="text-center text-gray-600 dark:text-gray-300">
                      {zone.avg_duration} min
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={getOccupancyColor(zone.occupancy_rate)}>
                        {zone.occupancy_rate}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ZoneStatsTable;
