'use client';

import React from 'react';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}

export function EmptyState({ 
  icon, 
  title, 
  description, 
  actionLabel, 
  actionHref 
}: EmptyStateProps) {
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8">
        {icon || <Building2 className="h-16 w-16 text-gray-400 mb-4" />}
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          {title}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-center mb-4">
          {description}
        </p>
        {actionLabel && actionHref && (
          <Link href={actionHref}>
            <Button className="bg-blue-600 hover:bg-blue-700">
              {actionLabel}
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

export function NoOrganizationState() {
  return (
    <EmptyState
      title="Selecciona una organización"
      description="Debes tener una organización activa para ver el historial de sesiones."
    />
  );
}

export function NoBranchState() {
  return (
    <EmptyState
      title="No hay sucursal configurada"
      description="Necesitas crear una sucursal para gestionar el parking."
      actionLabel="Configurar Sucursal"
      actionHref="/app/organizacion/sucursales"
    />
  );
}
