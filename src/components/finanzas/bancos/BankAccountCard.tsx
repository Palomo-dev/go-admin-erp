'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Building2, 
  CreditCard, 
  MoreVertical, 
  Eye, 
  Edit, 
  ArrowRightLeft,
  CheckCircle,
  XCircle 
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/utils/Utils';
import { BankAccount } from './BancosService';

interface BankAccountCardProps {
  account: BankAccount;
  onToggleActive?: (accountId: number, isActive: boolean) => void;
}

export function BankAccountCard({ account, onToggleActive }: BankAccountCardProps) {
  const router = useRouter();

  const handleViewDetails = () => {
    router.push(`/app/finanzas/bancos/cuentas/${account.id}`);
  };

  const handleViewMovements = () => {
    router.push(`/app/finanzas/bancos/cuentas/${account.id}/movimientos`);
  };

  const handleEdit = () => {
    router.push(`/app/finanzas/bancos/cuentas/${account.id}?edit=true`);
  };

  const getAccountTypeLabel = (type: string | null) => {
    switch (type) {
      case 'checking': return 'Corriente';
      case 'savings': return 'Ahorros';
      case 'credit': return 'Crédito';
      default: return type || 'Cuenta';
    }
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                {account.name}
              </CardTitle>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {account.bank_name || 'Sin banco'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge 
              variant={account.is_active ? 'default' : 'secondary'}
              className={account.is_active 
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}
            >
              {account.is_active ? 'Activa' : 'Inactiva'}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <DropdownMenuItem onClick={handleViewDetails} className="cursor-pointer">
                  <Eye className="h-4 w-4 mr-2" />
                  Ver Detalles
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleViewMovements} className="cursor-pointer">
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Movimientos
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleEdit} className="cursor-pointer">
                  <Edit className="h-4 w-4 mr-2" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => onToggleActive?.(account.id, !account.is_active)}
                  className="cursor-pointer"
                >
                  {account.is_active ? (
                    <>
                      <XCircle className="h-4 w-4 mr-2 text-red-500" />
                      <span className="text-red-600 dark:text-red-400">Desactivar</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                      <span className="text-green-600 dark:text-green-400">Activar</span>
                    </>
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="space-y-3">
          {/* Número de cuenta */}
          {account.account_number && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <CreditCard className="h-4 w-4" />
              <span>****{account.account_number.slice(-4)}</span>
              <Badge variant="outline" className="ml-auto text-xs">
                {getAccountTypeLabel(account.account_type)}
              </Badge>
            </div>
          )}

          {/* Balance */}
          <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">Saldo Actual</p>
            <p className={`text-2xl font-bold ${
              account.balance >= 0 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-red-600 dark:text-red-400'
            }`}>
              {formatCurrency(account.balance, account.currency || 'COP')}
            </p>
          </div>

          {/* Acciones rápidas */}
          <div className="flex gap-2 pt-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 dark:border-gray-600"
              onClick={handleViewMovements}
            >
              <ArrowRightLeft className="h-4 w-4 mr-1" />
              Movimientos
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 dark:border-gray-600"
              onClick={handleViewDetails}
            >
              <Eye className="h-4 w-4 mr-1" />
              Detalles
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
