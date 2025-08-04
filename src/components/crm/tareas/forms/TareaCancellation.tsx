'use client';

import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle } from 'lucide-react';

interface TareaCancellationProps {
  form: UseFormReturn<any>;
  isVisible: boolean;
}

const TareaCancellation: React.FC<TareaCancellationProps> = ({ form, isVisible }) => {
  if (!isVisible) return null;

  return (
    <div className="space-y-4 p-4 border border-red-200 rounded-lg bg-red-50 dark:bg-red-950 dark:border-red-800">
      <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
        <AlertTriangle className="h-5 w-5" />
        <h4 className="font-medium">Motivo de Cancelación</h4>
      </div>
      
      <FormField
        control={form.control}
        name="cancellation_reason"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-red-700 dark:text-red-300">
              Describe el motivo por el cual se cancela esta tarea
            </FormLabel>
            <FormControl>
              <Textarea
                placeholder="Ej: Cliente no disponible, cambio de prioridades, etc."
                className="min-h-[80px] border-red-300 focus:border-red-500 dark:border-red-700"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};

export default TareaCancellation;
