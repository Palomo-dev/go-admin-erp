'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { Alert } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { Activity } from '@/types/activity';
import { ActividadItem } from './ActividadItem';
import { ActividadesPagination } from './ActividadesPagination';

interface ActividadesListProps {
  activities: Activity[];
  loading: boolean;
  error: string | null;
  currentPage: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onOpenContext?: (activity: Activity) => void;
  className?: string;
}

export function ActividadesList({
  activities,
  loading,
  error,
  currentPage,
  totalPages,
  total,
  limit,
  onPageChange,
  onOpenContext,
  className
}: ActividadesListProps) {
  if (loading && activities.length === 0) {
    return (
      <Card className={cn("p-8", className)}>
        <div className="flex items-center justify-center">
          <LoadingSpinner />
          <span className="ml-2 text-gray-600 dark:text-gray-400">
            Cargando actividades...
          </span>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn("p-6", className)}>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <div>
            <h4 className="font-medium">Error al cargar actividades</h4>
            <p className="text-sm mt-1">{error}</p>
          </div>
        </Alert>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card className={cn("p-8", className)}>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No hay actividades
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            No se encontraron actividades con los filtros aplicados.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Paginación superior */}
      <ActividadesPagination
        currentPage={currentPage}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={onPageChange}
        loading={loading}
      />

      {/* Lista de actividades */}
      <Card className="divide-y divide-gray-200 dark:divide-gray-700">
        {activities.map((activity, index) => (
          <ActividadItem
            key={activity.id}
            activity={activity}
            isLast={index === activities.length - 1}
            onOpenContext={onOpenContext}
          />
        ))}
      </Card>

      {/* Paginación inferior */}
      {totalPages > 1 && (
        <ActividadesPagination
          currentPage={currentPage}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={onPageChange}
          loading={loading}
          className="pt-4 border-t border-gray-200 dark:border-gray-700"
        />
      )}
    </div>
  );
}
