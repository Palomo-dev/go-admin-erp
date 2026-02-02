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
import { Trophy, Car } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';

interface TopPlate {
  plate: string;
  visits: number;
  totalSpent: number;
}

interface TopPlatesTableProps {
  data: TopPlate[];
  isLoading?: boolean;
}

export function TopPlatesTable({ data, isLoading }: TopPlatesTableProps) {
  const getMedalColor = (index: number) => {
    switch (index) {
      case 0:
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 1:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
      case 2:
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      default:
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    }
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
          <Trophy className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          Top Clientes Frecuentes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="animate-pulse text-gray-400">Cargando...</div>
          </div>
        ) : data.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-gray-400">
            No hay datos disponibles
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-900/50">
                  <TableHead className="font-semibold w-12">#</TableHead>
                  <TableHead className="font-semibold">Placa</TableHead>
                  <TableHead className="font-semibold text-center">Visitas</TableHead>
                  <TableHead className="font-semibold text-right">Total Gastado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((item, index) => (
                  <TableRow
                    key={item.plate}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <TableCell>
                      <Badge className={getMedalColor(index)}>{index + 1}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Car className="h-4 w-4 text-gray-400" />
                        <span className="font-mono font-medium text-gray-900 dark:text-white">
                          {item.plate}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        {item.visits}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium text-green-600 dark:text-green-400">
                      {formatCurrency(item.totalSpent)}
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

export default TopPlatesTable;
