"use client";

import React from 'react';
import Link from 'next/link';
import { Receipt, ArrowLeft } from 'lucide-react';
import TaxesTable from './TaxesTable';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const TaxesIndexPage = () => {
  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/app/finanzas">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
          <Receipt className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Gestión de Impuestos
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Finanzas / Impuestos
          </p>
        </div>
      </div>
      
      {/* Content */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <TaxesTable />
        </CardContent>
      </Card>
    </div>
  );
};

export default TaxesIndexPage;
