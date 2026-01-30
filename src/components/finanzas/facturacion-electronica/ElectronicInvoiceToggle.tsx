'use client';

import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Zap, Info } from 'lucide-react';
import { cn } from '@/utils/Utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ElectronicInvoiceToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  showLabel?: boolean;
  showTooltip?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ElectronicInvoiceToggle({
  checked,
  onCheckedChange,
  disabled = false,
  showLabel = true,
  showTooltip = true,
  size = 'md',
  className,
}: ElectronicInvoiceToggleProps) {
  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const toggle = (
    <div className={cn('flex items-center gap-2', className)}>
      <Switch
        id="electronic-invoice"
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cn(
          checked && 'bg-blue-600 data-[state=checked]:bg-blue-600'
        )}
      />
      {showLabel && (
        <Label
          htmlFor="electronic-invoice"
          className={cn(
            'flex items-center gap-1.5 cursor-pointer select-none',
            sizeClasses[size],
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <Zap className={cn(
            'h-4 w-4',
            checked ? 'text-blue-500' : 'text-gray-400'
          )} />
          <span className={checked ? 'text-blue-600 dark:text-blue-400 font-medium' : ''}>
            Factura Electrónica
          </span>
          {showTooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">
                    Al activar esta opción, la factura será enviada automáticamente
                    a la DIAN para su validación electrónica.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </Label>
      )}
    </div>
  );

  return toggle;
}

export default ElectronicInvoiceToggle;
