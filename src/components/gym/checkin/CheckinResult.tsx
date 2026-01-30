'use client';

import React from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  User, 
  Calendar, 
  Clock, 
  CreditCard,
  Snowflake,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import { Membership, getDaysRemaining, getMembershipStatusColor, getMembershipStatusLabel } from '@/lib/services/gymService';
import { formatDate } from '@/utils/Utils';

interface CheckinResultProps {
  membership: Membership;
  validationResult: { valid: boolean; reason?: string };
  onCheckin: () => void;
  onDeny: (reason: string) => void;
  onRenew: () => void;
  isProcessing?: boolean;
}

export function CheckinResult({ 
  membership, 
  validationResult, 
  onCheckin, 
  onDeny,
  onRenew,
  isProcessing 
}: CheckinResultProps) {
  const daysRemaining = getDaysRemaining(membership.end_date);
  const isExpired = daysRemaining < 0;
  const isExpiringSoon = daysRemaining >= 0 && daysRemaining <= 7;
  const customer = membership.customers;
  const plan = membership.membership_plans;

  return (
    <div className={cn(
      "rounded-lg border-2 p-6 shadow-sm transition-all",
      validationResult.valid 
        ? "bg-green-50 dark:bg-green-900/20 border-green-500" 
        : "bg-red-50 dark:bg-red-900/20 border-red-500"
    )}>
      {/* Header con estado */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {validationResult.valid ? (
            <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/40">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
          ) : (
            <div className="p-3 rounded-full bg-red-100 dark:bg-red-900/40">
              <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
          )}
          <div>
            <h3 className={cn(
              "text-2xl font-bold",
              validationResult.valid 
                ? "text-green-700 dark:text-green-400" 
                : "text-red-700 dark:text-red-400"
            )}>
              {validationResult.valid ? 'ACCESO PERMITIDO' : 'ACCESO DENEGADO'}
            </h3>
            {!validationResult.valid && validationResult.reason && (
              <p className="text-red-600 dark:text-red-400 font-medium">
                {validationResult.reason}
              </p>
            )}
          </div>
        </div>
        
        <Badge className={getMembershipStatusColor(membership.status)}>
          {getMembershipStatusLabel(membership.status)}
        </Badge>
      </div>

      {/* Información del miembro */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700">
              <User className="h-5 w-5 text-gray-600 dark:text-gray-300" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Miembro</p>
              <p className="font-semibold text-gray-900 dark:text-white text-lg">
                {customer?.first_name} {customer?.last_name}
              </p>
              {customer?.identification_number && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Doc: {customer.identification_number}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700">
              <CreditCard className="h-5 w-5 text-gray-600 dark:text-gray-300" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Plan</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {plan?.name || 'Sin plan'}
              </p>
            </div>
          </div>

          {membership.access_code && (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700">
                <span className="text-sm font-mono text-gray-600 dark:text-gray-300">
                  #
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Código</p>
                <p className="font-mono font-medium text-gray-900 dark:text-white">
                  {membership.access_code}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700">
              <Calendar className="h-5 w-5 text-gray-600 dark:text-gray-300" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Vencimiento</p>
              <p className={cn(
                "font-semibold",
                isExpired ? "text-red-600 dark:text-red-400" :
                isExpiringSoon ? "text-yellow-600 dark:text-yellow-400" :
                "text-gray-900 dark:text-white"
              )}>
                {formatDate(membership.end_date)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700">
              <Clock className="h-5 w-5 text-gray-600 dark:text-gray-300" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Días restantes</p>
              <p className={cn(
                "font-semibold text-lg",
                isExpired ? "text-red-600 dark:text-red-400" :
                isExpiringSoon ? "text-yellow-600 dark:text-yellow-400" :
                "text-green-600 dark:text-green-400"
              )}>
                {isExpired ? `Venció hace ${Math.abs(daysRemaining)} días` : `${daysRemaining} días`}
              </p>
            </div>
          </div>

          {membership.status === 'frozen' && (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40">
                <Snowflake className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                  Membresía congelada
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Alerta de vencimiento próximo */}
      {isExpiringSoon && !isExpired && validationResult.valid && (
        <div className="flex items-center gap-3 p-4 mb-6 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
          <p className="text-yellow-700 dark:text-yellow-300">
            <strong>Atención:</strong> La membresía vence en {daysRemaining} días. 
            Considera ofrecer renovación.
          </p>
        </div>
      )}

      {/* Botones de acción */}
      <div className="flex flex-wrap gap-3">
        {validationResult.valid ? (
          <Button
            onClick={onCheckin}
            disabled={isProcessing}
            className="flex-1 h-14 text-lg bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle2 className="h-6 w-6 mr-2" />
            Registrar Check-in
          </Button>
        ) : (
          <>
            <Button
              onClick={() => onDeny(validationResult.reason || 'Acceso denegado')}
              disabled={isProcessing}
              variant="destructive"
              className="flex-1 h-14 text-lg"
            >
              <XCircle className="h-6 w-6 mr-2" />
              Registrar Denegación
            </Button>
            
            {(isExpired || membership.status === 'expired') && (
              <Button
                onClick={onRenew}
                disabled={isProcessing}
                className="flex-1 h-14 text-lg bg-blue-600 hover:bg-blue-700 text-white"
              >
                <RefreshCw className="h-6 w-6 mr-2" />
                Renovar Membresía
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default CheckinResult;
