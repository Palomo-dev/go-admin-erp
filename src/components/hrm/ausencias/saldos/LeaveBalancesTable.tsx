'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import {
  MoreVertical,
  Edit,
  RefreshCw,
  User,
  Calendar,
} from 'lucide-react';
import type { LeaveBalance } from '@/lib/services/leaveBalancesService';

interface LeaveBalancesTableProps {
  balances: LeaveBalance[];
  onAdjust: (id: string) => void;
  onRecalculate: (id: string) => void;
  isLoading?: boolean;
}

export function LeaveBalancesTable({
  balances,
  onAdjust,
  onRecalculate,
  isLoading,
}: LeaveBalancesTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (balances.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
        <p>No hay saldos de ausencias</p>
      </div>
    );
  }

  const getUsagePercent = (balance: LeaveBalance): number => {
    const total = balance.initial_balance + balance.accrued + balance.carried_over;
    if (total === 0) return 0;
    return Math.round((balance.used / total) * 100);
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800/50">
            <TableHead>Empleado</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-center">Año</TableHead>
            <TableHead className="text-right">Inicial</TableHead>
            <TableHead className="text-right">Acumulado</TableHead>
            <TableHead className="text-right">Arrastre</TableHead>
            <TableHead className="text-right">Usado</TableHead>
            <TableHead className="text-right">Pendiente</TableHead>
            <TableHead className="text-right">Disponible</TableHead>
            <TableHead>Uso</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {balances.map((balance) => {
            const usagePercent = getUsagePercent(balance);
            const total = balance.initial_balance + balance.accrued + balance.carried_over;

            return (
              <TableRow key={balance.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {balance.employee_name}
                      </span>
                      {balance.employee_code && (
                        <span className="block text-xs text-gray-400">
                          {balance.employee_code}
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {balance.leave_type_code} - {balance.leave_type_name}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  <span className="font-mono text-sm text-gray-600 dark:text-gray-300">
                    {balance.year}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-mono text-sm text-gray-900 dark:text-white">
                    {balance.initial_balance}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-mono text-sm text-purple-600 dark:text-purple-400">
                    +{balance.accrued}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-mono text-sm text-blue-600 dark:text-blue-400">
                    +{balance.carried_over}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-mono text-sm text-red-600 dark:text-red-400">
                    -{balance.used}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-mono text-sm text-yellow-600 dark:text-yellow-400">
                    {balance.pending}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-mono text-sm font-bold text-green-600 dark:text-green-400">
                    {balance.available}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="w-24">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-500">{usagePercent}%</span>
                      <span className="text-gray-400">{balance.used}/{total}</span>
                    </div>
                    <Progress value={usagePercent} className="h-2" />
                  </div>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onAdjust(balance.id)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Ajustar Saldo
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onRecalculate(balance.id)}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Recalcular
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
