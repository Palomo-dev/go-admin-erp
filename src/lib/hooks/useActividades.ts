'use client';

import { useState, useEffect, useCallback } from 'react';
import { getActivities, getActivityStats, createActivity } from '../services/activityService';
import { useActivityRealtime } from './useActivityRealtime';
import type { Activity, ActivityFilter, NewActivity, ActivityResponse } from '@/types/activity';

interface UseActividadesReturn {
  // Estado
  activities: Activity[];
  loading: boolean;
  error: string | null;
  total: number;
  currentPage: number;
  totalPages: number;
  limit: number;
  
  // Estadísticas
  stats: {
    total: number;
    byType: Record<string, number>;
    today: number;
    thisWeek: number;
    thisMonth: number;
  } | null;
  
  // Acciones
  loadActivities: (filters?: ActivityFilter) => Promise<void>;
  goToPage: (page: number) => Promise<void>;
  createNewActivity: (activity: NewActivity) => Promise<Activity>;
  refresh: () => Promise<void>;
  
  // Estado de carga
  loadingStats: boolean;
}

export function useActividades(initialFilters: ActivityFilter = {}): UseActividadesReturn {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentFilters, setCurrentFilters] = useState<ActivityFilter>({
    page: 1,
    limit: 50,
    ...initialFilters
  });
  const [stats, setStats] = useState<any>(null);

  // Cargar actividades
  const loadActivities = useCallback(async (filters: ActivityFilter = currentFilters) => {
    try {
      console.log('🔄 loadActividades iniciado con filtros:', filters);
      setLoading(true);
      setError(null);
      
      // Asegurar valores por defecto
      const filtersWithDefaults = {
        page: 1,
        limit: 50,
        ...filters
      };
      
      setCurrentFilters(filtersWithDefaults);
      console.log('📋 Filtros aplicados:', filtersWithDefaults);

      const response: ActivityResponse = await getActivities(filtersWithDefaults);
      console.log('📥 Respuesta recibida:', response);
      
      setActivities(response.data);
      setTotal(response.count);
      setTotalPages(response.totalPages);

      console.log('✅ Estado actualizado:', {
        activitiesCount: response.data.length,
        total: response.count,
        totalPages: response.totalPages,
        currentPage: filtersWithDefaults.page
      });

    } catch (err) {
      console.error('❌ Error al cargar actividades:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  // Ir a página específica
  const goToPage = useCallback(async (page: number) => {
    if (page < 1 || (totalPages > 0 && page > totalPages) || loading) return;

    try {
      console.log(`📄 Navegando a página ${page}...`);
      
      const newFilters = {
        ...currentFilters,
        page
      };

      await loadActivities(newFilters);

    } catch (err) {
      console.error('❌ Error al navegar a página:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    }
  }, [totalPages, loading, currentFilters, loadActivities]);

  // Crear nueva actividad
  const createNewActivity = useCallback(async (activity: NewActivity): Promise<Activity> => {
    try {
      const newActivity = await createActivity(activity);
      
      // Recargar actividades para mostrar la nueva
      await loadActivities(currentFilters);
      
      return newActivity;
    } catch (err) {
      console.error('Error al crear actividad:', err);
      throw err;
    }
  }, [currentFilters, loadActivities]);

  // Refrescar actividades
  const refresh = useCallback(async () => {
    console.log('🔄 Refrescando actividades...');
    await loadActivities({ ...currentFilters, page: 1 });
  }, [currentFilters, loadActivities]);

  // Cargar estadísticas
  const loadStats = useCallback(async () => {
    try {
      setLoadingStats(true);
      const statsData = await getActivityStats(currentFilters);
      setStats(statsData);
    } catch (err) {
      console.error('Error al cargar estadísticas:', err);
    } finally {
      setLoadingStats(false);
    }
  }, [currentFilters]);

  // Cargar datos iniciales
  useEffect(() => {
    loadActivities();
    loadStats();
  }, []);

  // Conectar tiempo real
  const { newActivity, requestNotificationPermission } = useActivityRealtime();

  // Solicitar permisos de notificación al iniciar
  useEffect(() => {
    requestNotificationPermission();
  }, [requestNotificationPermission]);

  return {
    // Estado
    activities,
    loading,
    error,
    total,
    currentPage: currentFilters.page || 1,
    totalPages,
    limit: currentFilters.limit || 50,
    stats,
    
    // Acciones
    loadActivities,
    goToPage,
    createNewActivity,
    refresh,
    
    // Estado de carga
    loadingStats
  };
}
