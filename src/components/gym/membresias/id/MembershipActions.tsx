'use client';

import React from 'react';
import { RefreshCw, Snowflake, XCircle, Play, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Membership } from '@/lib/services/gymService';

interface MembershipActionsProps {
  membership: Membership;
  onRenew: () => void;
  onFreeze: () => void;
  onUnfreeze: () => void;
  onCancel: () => void;
  onShowQR: () => void;
  isProcessing?: boolean;
}

export function MembershipActions({ 
  membership, 
  onRenew, 
  onFreeze, 
  onUnfreeze, 
  onCancel,
  onShowQR,
  isProcessing 
}: MembershipActionsProps) {
  const canRenew = membership.status !== 'cancelled';
  const canFreeze = membership.status === 'active';
  const canUnfreeze = membership.status === 'frozen';
  const canCancel = membership.status !== 'cancelled';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
        Acciones
      </h3>
      
      <div className="flex flex-wrap gap-2">
        {canRenew && (
          <Button
            onClick={onRenew}
            disabled={isProcessing}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Renovar
          </Button>
        )}

        {canFreeze && (
          <Button
            onClick={onFreeze}
            disabled={isProcessing}
            variant="outline"
            className="border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
          >
            <Snowflake className="h-4 w-4 mr-2" />
            Congelar
          </Button>
        )}

        {canUnfreeze && (
          <Button
            onClick={onUnfreeze}
            disabled={isProcessing}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Play className="h-4 w-4 mr-2" />
            Descongelar
          </Button>
        )}

        <Button
          onClick={onShowQR}
          disabled={isProcessing}
          variant="outline"
          className="border-gray-300 dark:border-gray-600"
        >
          <QrCode className="h-4 w-4 mr-2" />
          Ver QR
        </Button>

        {canCancel && (
          <Button
            onClick={onCancel}
            disabled={isProcessing}
            variant="outline"
            className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <XCircle className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}

export default MembershipActions;
