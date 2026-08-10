'use client';

import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

const ChannelDetailContent = React.lazy(() => import('./website/ChannelDetailContent'));

interface ChannelDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: string | null;
}

export default function ChannelDetailDrawer({
  open,
  onOpenChange,
  channelId,
}: ChannelDetailDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl lg:max-w-4xl overflow-y-auto p-0"
      >
        <SheetHeader className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-background z-10">
          <SheetTitle>Configuración del Canal</SheetTitle>
          <SheetDescription>
            Personaliza el widget de chat y las opciones del canal
          </SheetDescription>
        </SheetHeader>
        <div className="p-6">
          {channelId && (
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                </div>
              }
            >
              <ChannelDetailContent channelId={channelId} />
            </Suspense>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
