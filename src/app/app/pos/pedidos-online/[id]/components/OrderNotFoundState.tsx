'use client';

import { Button } from '@/components/ui/button';
import { ArrowLeft, FileQuestion } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/utils/Utils';
import { useTranslations } from 'next-intl';

interface OrderNotFoundStateProps {
  message?: string;
}

export function OrderNotFoundState({ 
  message 
}: OrderNotFoundStateProps) {
  const t = useTranslations('pedidoWeb');
  const router = useRouter();

  return (
    <div className="p-6">
      <Button variant="ghost" onClick={() => router.back()}>
        <ArrowLeft className="h-4 w-4 mr-2 dark:text-gray-300" />
        {t('detalle.volver')}
      </Button>
      <div className={cn(
        "flex flex-col items-center justify-center",
        "text-center py-12 gap-4"
      )}>
        <FileQuestion className="h-16 w-16 text-muted-foreground dark:text-gray-400" />
        <p className="text-muted-foreground dark:text-gray-300 text-lg">{message ?? t('orderNotFoundState.pedidoNoEncontrado')}</p>
        <Button variant="outline" onClick={() => router.push('/app/pos/pedidos-online')} className="dark:border-gray-600">
          {t('orderNotFoundState.verTodosPedidos')}
        </Button>
      </div>
    </div>
  );
}
