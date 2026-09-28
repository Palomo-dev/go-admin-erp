'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { 
  Clock, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Ban,
  FileX,
  Zap
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import {
  type EInvoiceStatus,
  getEInvoiceStatusColor,
} from '@/lib/services/electronicInvoicingService';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const ESTADOS_BADGE = new Set<string>(['pending', 'processing', 'sent', 'accepted', 'rejected', 'failed', 'cancelled']);

interface FactusStatusBadgeProps {
  status: EInvoiceStatus | null | undefined;
  cufe?: string | null;
  showIcon?: boolean;
  showTooltip?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const StatusIcon = ({ status, className }: { status: EInvoiceStatus | null | undefined; className?: string }) => {
  const iconClass = cn('h-3.5 w-3.5', className);
  
  switch (status) {
    case 'pending':
      return <Clock className={iconClass} />;
    case 'processing':
    case 'sent':
      return <Loader2 className={cn(iconClass, 'animate-spin')} />;
    case 'accepted':
      return <CheckCircle2 className={iconClass} />;
    case 'rejected':
      return <XCircle className={iconClass} />;
    case 'failed':
      return <AlertTriangle className={iconClass} />;
    case 'cancelled':
      return <Ban className={iconClass} />;
    default:
      return <FileX className={iconClass} />;
  }
};

export function FactusStatusBadge({
  status,
  cufe,
  showIcon = true,
  showTooltip = true,
  size = 'md',
  className,
}: FactusStatusBadgeProps) {
  const colorClass = getEInvoiceStatusColor(status);
  const t = useTranslations('facturacionElectronica.estadosBadge');
  // El estado viene de la API (clave técnica); sin estado conocido, «Sin FE».
  const statusText = t((status && ESTADOS_BADGE.has(status) ? status : 'sinFe') as never);

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-xs px-2 py-1',
    lg: 'text-sm px-2.5 py-1',
  };

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        'font-medium border-0 gap-1',
        colorClass,
        sizeClasses[size],
        className
      )}
    >
      {showIcon && <StatusIcon status={status} />}
      <span>{statusText}</span>
    </Badge>
  );

  if (!showTooltip || !cufe) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs font-medium">
              <Zap className="h-3 w-3" />
              CUFE
            </div>
            <p className="text-xs text-muted-foreground font-mono break-all">
              {cufe}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default FactusStatusBadge;
