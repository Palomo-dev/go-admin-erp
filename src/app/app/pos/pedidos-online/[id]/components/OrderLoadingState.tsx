'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/Utils';

interface OrderLoadingStateProps {
  message?: string;
}

export function OrderLoadingState({ message = 'Cargando pedido...' }: OrderLoadingStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center h-screen",
      "gap-4"
    )}>
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}
