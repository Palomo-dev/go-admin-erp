'use client';

import React from 'react';

import { NuevoAjusteForm } from '@/components/inventario/ajustes/nuevo';

export default function NuevoAjustePage() {

  return (
    <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <NuevoAjusteForm />
    </div>
  );
}
