'use client';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CheckCircle2, XCircle, LogIn, LogOut, Clock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { QRValidationResult } from '@/lib/services/qrAttendanceService';

interface AttendanceResultProps {
  result: QRValidationResult;
  onReset: () => void;
}

export function AttendanceResult({ result, onReset }: AttendanceResultProps) {
  const isSuccess = result.success;
  const isCheckIn = result.event_type === 'check_in';

  return (
    <div
      className={cn(
        'w-full max-w-md mx-auto rounded-2xl p-6 text-center',
        isSuccess
          ? isCheckIn
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
          : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
      )}
    >
      {/* Icono principal */}
      <div className="mb-4">
        {isSuccess ? (
          <div
            className={cn(
              'w-20 h-20 rounded-full mx-auto flex items-center justify-center',
              isCheckIn ? 'bg-green-100 dark:bg-green-800' : 'bg-blue-100 dark:bg-blue-800'
            )}
          >
            {isCheckIn ? (
              <LogIn
                className={cn(
                  'h-10 w-10',
                  isCheckIn ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'
                )}
              />
            ) : (
              <LogOut className="h-10 w-10 text-blue-600 dark:text-blue-400" />
            )}
          </div>
        ) : (
          <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-800 mx-auto flex items-center justify-center">
            <XCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
          </div>
        )}
      </div>

      {/* Mensaje */}
      <h2
        className={cn(
          'text-xl font-bold mb-2',
          isSuccess
            ? isCheckIn
              ? 'text-green-700 dark:text-green-300'
              : 'text-blue-700 dark:text-blue-300'
            : 'text-red-700 dark:text-red-300'
        )}
      >
        {result.message}
      </h2>

      {/* Detalles del éxito */}
      {isSuccess && (
        <div className="space-y-3 mt-4">
          {result.employee_name && (
            <div className="flex items-center justify-center gap-2 text-gray-700 dark:text-gray-300">
              <User className="h-4 w-4" />
              <span className="font-medium">{result.employee_name}</span>
            </div>
          )}

          {result.event_at && (
            <div className="flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400">
              <Clock className="h-4 w-4" />
              <span>
                {format(new Date(result.event_at), "HH:mm:ss - EEEE d 'de' MMMM", {
                  locale: es,
                })}
              </span>
            </div>
          )}

          <div className="flex items-center justify-center gap-1 mt-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {isCheckIn ? 'Entrada registrada' : 'Salida registrada'}
            </span>
          </div>
        </div>
      )}

      {/* Botón para escanear de nuevo */}
      <Button
        onClick={onReset}
        className={cn(
          'mt-6 w-full',
          isSuccess
            ? isCheckIn
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-blue-600 hover:bg-blue-700'
            : 'bg-red-600 hover:bg-red-700'
        )}
      >
        {isSuccess ? 'Escanear otro código' : 'Intentar de nuevo'}
      </Button>
    </div>
  );
}

export default AttendanceResult;
