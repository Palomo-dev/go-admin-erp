'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Landmark, Plus, ArrowLeft, RefreshCw, FileDown } from 'lucide-react';

interface BancosPageHeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function BancosPageHeader({ onRefresh, isRefreshing }: BancosPageHeaderProps) {
  const router = useRouter();

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Link href="/app/finanzas">
          <Button variant="ghost" size="icon" className="hover:bg-gray-100 dark:hover:bg-gray-800">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
          <Landmark className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Gestión Bancaria
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Finanzas / Bancos
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {onRefresh && (
          <Button 
            variant="outline" 
            size="icon" 
            onClick={onRefresh} 
            disabled={isRefreshing}
            className="dark:border-gray-600 dark:hover:bg-gray-800"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        )}
        <Button 
          variant="outline"
          className="dark:border-gray-600 dark:hover:bg-gray-800"
        >
          <FileDown className="h-4 w-4 mr-2" />
          Exportar
        </Button>
        <Button 
          onClick={() => router.push('/app/finanzas/bancos/cuentas/nuevo')}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nueva Cuenta
        </Button>
      </div>
    </div>
  );
}
