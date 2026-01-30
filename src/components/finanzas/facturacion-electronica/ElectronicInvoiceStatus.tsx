'use client';

import React, { useState, useEffect } from 'react';
import { FactusStatusBadge } from './FactusStatusBadge';
import {
  electronicInvoicingService,
  type ElectronicInvoiceJob,
  type EInvoiceStatus,
} from '@/lib/services/electronicInvoicingService';

interface ElectronicInvoiceStatusProps {
  invoiceId: string;
  initialStatus?: EInvoiceStatus | null;
  initialCufe?: string | null;
  showIcon?: boolean;
  showTooltip?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onStatusChange?: (job: ElectronicInvoiceJob | null) => void;
}

export function ElectronicInvoiceStatus({
  invoiceId,
  initialStatus,
  initialCufe,
  showIcon = true,
  showTooltip = true,
  size = 'sm',
  className,
  onStatusChange,
}: ElectronicInvoiceStatusProps) {
  const [status, setStatus] = useState<EInvoiceStatus | null>(initialStatus || null);
  const [cufe, setCufe] = useState<string | null>(initialCufe || null);
  const [isLoading, setIsLoading] = useState(!initialStatus);

  useEffect(() => {
    if (initialStatus !== undefined) {
      setStatus(initialStatus);
      setCufe(initialCufe || null);
      setIsLoading(false);
      return;
    }

    loadStatus();
  }, [invoiceId, initialStatus, initialCufe]);

  const loadStatus = async () => {
    setIsLoading(true);
    try {
      const job = await electronicInvoicingService.getInvoiceEInvoiceStatus(invoiceId);
      if (job) {
        setStatus(job.status);
        setCufe(job.cufe);
        onStatusChange?.(job);
      } else {
        setStatus(null);
        setCufe(null);
        onStatusChange?.(null);
      }
    } catch (error) {
      console.error('Error loading e-invoice status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-5 w-16 animate-pulse bg-gray-200 dark:bg-gray-700 rounded" />
    );
  }

  // No mostrar nada si no tiene estado de FE
  if (!status) {
    return null;
  }

  return (
    <FactusStatusBadge
      status={status}
      cufe={cufe}
      showIcon={showIcon}
      showTooltip={showTooltip}
      size={size}
      className={className}
    />
  );
}

export default ElectronicInvoiceStatus;
