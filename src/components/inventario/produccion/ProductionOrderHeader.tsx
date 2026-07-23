'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Factory, Plus, RefreshCw } from 'lucide-react';

interface ProductionOrderHeaderProps {
  loading: boolean;
  onRefresh: () => void;
  onNewOrder: () => void;
}

export function ProductionOrderHeader({
  loading,
  onRefresh,
  onNewOrder,
}: ProductionOrderHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Link href="/app/inventario">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <Factory className="h-6 w-6 text-blue-600" />
            </div>
            Órdenes de Producción
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Inventario / Producción
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        <Button
          onClick={onNewOrder}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nueva Orden
        </Button>
      </div>
    </div>
  );
}
