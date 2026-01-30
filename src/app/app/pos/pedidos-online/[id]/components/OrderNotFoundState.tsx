'use client';

import { Button } from '@/components/ui/button';
import { ArrowLeft, FileQuestion } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/utils/Utils';

interface OrderNotFoundStateProps {
  message?: string;
}

export function OrderNotFoundState({ 
  message = 'Pedido no encontrado' 
}: OrderNotFoundStateProps) {
  const router = useRouter();

  return (
    <div className="p-6">
      <Button variant="ghost" onClick={() => router.back()}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Volver
      </Button>
      <div className={cn(
        "flex flex-col items-center justify-center",
        "text-center py-12 gap-4"
      )}>
        <FileQuestion className="h-16 w-16 text-muted-foreground" />
        <p className="text-muted-foreground text-lg">{message}</p>
        <Button variant="outline" onClick={() => router.push('/app/pos/pedidos-online')}>
          Ver todos los pedidos
        </Button>
      </div>
    </div>
  );
}
