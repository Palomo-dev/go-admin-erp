'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LogIn, ChevronRight, User, DoorOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/utils/Utils';

interface TodayArrival {
  id: string;
  code: string;
  customerName: string;
  customerEmail: string;
  checkin: string;
  checkout: string;
  spaces: string[];
  status: string;
  totalEstimated: number;
}

interface ArrivalsCardProps {
  arrivals: TodayArrival[];
  isLoading?: boolean;
  onCheckIn?: (id: string) => void;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  confirmed: { label: 'Confirmada', variant: 'default' },
  tentative: { label: 'Tentativa', variant: 'outline' },
};

function ArrivalItem({ arrival, onCheckIn }: { arrival: TodayArrival; onCheckIn?: (id: string) => void }) {
  const router = useRouter();
  const status = statusConfig[arrival.status] || { label: arrival.status, variant: 'secondary' as const };

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-sm font-medium text-blue-600 dark:text-blue-400">
            {arrival.code}
          </span>
          <Badge variant={status.variant} className="text-xs">
            {status.label}
          </Badge>
        </div>
        <div className="flex items-center gap-1 text-sm text-gray-900 dark:text-white">
          <User className="h-3.5 w-3.5 text-gray-400" />
          <span className="truncate">{arrival.customerName}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-1">
          <DoorOpen className="h-3 w-3" />
          <span>{arrival.spaces.join(', ') || 'Sin asignar'}</span>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          {formatCurrency(arrival.totalEstimated)}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 text-green-600 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-950"
          onClick={(e) => {
            e.stopPropagation();
            onCheckIn?.(arrival.id);
          }}
        >
          <LogIn className="h-3.5 w-3.5 mr-1" />
          Check-in
        </Button>
      </div>
    </div>
  );
}

function ArrivalSkeleton() {
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border border-gray-200 dark:border-gray-700 animate-pulse">
      <div className="flex-1 space-y-2">
        <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    </div>
  );
}

export function ArrivalsCard({ arrivals, isLoading = false, onCheckIn }: ArrivalsCardProps) {
  const router = useRouter();

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
            <LogIn className="h-5 w-5 text-green-600" />
            Llegadas Hoy
            {arrivals.length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                {arrivals.length}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/app/pms/checkin')}
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Ver todas
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <>
            <ArrivalSkeleton />
            <ArrivalSkeleton />
            <ArrivalSkeleton />
          </>
        ) : arrivals.length === 0 ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 mb-3">
              <LogIn className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No hay llegadas programadas para hoy
            </p>
          </div>
        ) : (
          arrivals.slice(0, 5).map((arrival) => (
            <ArrivalItem key={arrival.id} arrival={arrival} onCheckIn={onCheckIn} />
          ))
        )}
      </CardContent>
    </Card>
  );
}
