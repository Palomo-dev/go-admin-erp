'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getActivities } from '@/lib/services/activityService';
import type { Activity, ActivityFilter, ActivityResponse } from '@/types/activity';

interface ActividadesDataLoaderProps {
  filtros: ActivityFilter;
  refreshKey: number;
  onPageChange: (page: number) => void;
  render: (props: {
    activities: Activity[];
    loading: boolean;
    error: string | null;
    currentPage: number;
    totalPages: number;
    total: number;
    limit: number;
    pageChange: (page: number) => void;
  }) => React.ReactNode;
}

export function ActividadesDataLoader({
  filtros,
  refreshKey,
  onPageChange,
  render
}: ActividadesDataLoaderProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const loadActivities = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response: ActivityResponse = await getActivities(filtros);

      // Reemplazar actividades con los datos de la página actual
      setActivities(response.data);
      setTotalPages(response.totalPages);
      setTotal(response.count);

    } catch (err) {
      console.error('Error al cargar actividades:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  // Cargar actividades cuando cambian filtros o refreshKey
  useEffect(() => {
    loadActivities();
  }, [loadActivities, refreshKey]);

  // Función para cambiar de página
  const handlePageChange = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages && !loading) {
      onPageChange(page);
    }
  }, [totalPages, loading, onPageChange]);

  return (
    <>
      {render({
        activities,
        loading,
        error,
        currentPage: filtros.page || 1,
        totalPages,
        total,
        limit: filtros.limit || 50,
        pageChange: handlePageChange
      })}
    </>
  );
}
