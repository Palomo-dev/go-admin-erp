'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LogOut, ChevronRight, User, DoorOpen, CreditCard } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/utils/Utils';

interface TodayDeparture {
  id: string;
  code: string;
  customerName: string;
  spaces: string[];
  checkout: string;
  balance: number;
  status: string;
}

interface DeparturesCardProps {
  departures: TodayDeparture[];
  isLoading?: boolean;
  onCheckOut?: (id: string) => void;
}

function DepartureItem({ departure, onCheckOut }: { departure: TodayDeparture; onCheckOut?: (id: string) => void }) {
  const router = useRouter();
  const hasBalance = departure.balance > 0;

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-sm font-medium text-blue-600 dark:text-blue-400">
            {departure.code}
          </span>
          {hasBalance && (
            <Badge variant="destructive" className="text-xs">
              <CreditCard className="h-3 w-3 mr-1" />
              Saldo pendiente
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 text-sm text-gray-900 dark:text-white">
          <User className="h-3.5 w-3.5 text-gray-400" />
          <span className="truncate">{departure.customerName}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-1">
          <DoorOpen className="h-3 w-3" />
          <span>{departure.spaces.join(', ') || 'Sin asignar'}</span>
        </div>
      </div>
      <div className="text-right">
        {hasBalance && (
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            {formatCurrency(departure.balance)}
          </p>
        )}
        <Button
          size="sm"
          variant="outline"
          className="mt-2 text-blue-600 border-blue-300 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-700 dark:hover:bg-blue-950"
          onClick={(e) => {
            e.stopPropagation();
            onCheckOut?.(departure.id);
          }}
        >
          <LogOut className="h-3.5 w-3.5 mr-1" />
          Check-out
        </Button>
      </div>
    </div>
  );
}

function DepartureSkeleton() {
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

export function DeparturesCard({ departures, isLoading = false, onCheckOut }: DeparturesCardProps) {
  const router = useRouter();

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
            <LogOut className="h-5 w-5 text-blue-600" />
            Salidas Hoy
            {departures.length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                {departures.length}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/app/pms/checkout')}
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
            <DepartureSkeleton />
            <DepartureSkeleton />
            <DepartureSkeleton />
          </>
        ) : departures.length === 0 ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 mb-3">
              <LogOut className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No hay salidas programadas para hoy
            </p>
          </div>
        ) : (
          departures.slice(0, 5).map((departure) => (
            <DepartureItem key={departure.id} departure={departure} onCheckOut={onCheckOut} />
          ))
        )}
      </CardContent>
    </Card>
  );
}
