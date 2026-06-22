'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { NuevoAjusteForm } from '@/components/inventario/ajustes/nuevo';

export default function NuevoAjustePage() {
  const { theme } = useTheme();

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <NuevoAjusteForm />
    </div>
  );
}
