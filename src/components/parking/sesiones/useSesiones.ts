'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { SessionFilters } from './SesionesFilters';
import { ParkingSession } from './SesionesTable';

export interface ParkingSpace {
  id: string;
  name: string;
  status: string;
}

export interface SessionStats {
  totalSessions: number;
  activeSessions: number;
  closedSessions: number;
  cancelledSessions: number;
  totalRevenue: number;
  avgDuration: number;
}

const initialFilters: SessionFilters = {
  search: '',
  status: 'all',
  vehicleType: 'all',
  dateFrom: '',
  dateTo: '',
  isSubscriber: 'all',
};

const initialStats: SessionStats = {
  totalSessions: 0,
  activeSessions: 0,
  closedSessions: 0,
  cancelledSessions: 0,
  totalRevenue: 0,
  avgDuration: 0,
};

export function useSesiones() {
  const { organization } = useOrganization();
  const { toast } = useToast();

  const [branchId, setBranchId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<ParkingSession[]>([]);
  const [spaces, setSpaces] = useState<ParkingSpace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<SessionFilters>(initialFilters);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalItems, setTotalItems] = useState(0);
  const [stats, setStats] = useState<SessionStats>(initialStats);

  // Obtener branch_id
  useEffect(() => {
    const fetchBranchId = async () => {
      if (!organization?.id) {
        setBranchId(null);
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('branches')
          .select('id')
          .eq('organization_id', organization.id)
          .order('id', { ascending: true })
          .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
          setBranchId(data[0].id);
        } else {
          setBranchId(null);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Error fetching branch:', err);
        setBranchId(null);
        setIsLoading(false);
      }
    };

    fetchBranchId();
  }, [organization?.id]);

  // Cargar estadísticas
  const loadStats = useCallback(async () => {
    if (!branchId) return;

    try {
      const { data: allSessions, error } = await supabase
        .from('parking_sessions')
        .select('status, amount, duration_min')
        .eq('branch_id', branchId);

      if (error) throw error;

      const totalSessions = allSessions?.length || 0;
      const activeSessions = allSessions?.filter((s) => s.status === 'open').length || 0;
      const closedSessions = allSessions?.filter((s) => s.status === 'closed').length || 0;
      const cancelledSessions = allSessions?.filter((s) => s.status === 'cancelled').length || 0;

      const totalRevenue = allSessions
        ?.filter((s) => s.status === 'closed' && s.amount)
        .reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0) || 0;

      const durationsArray = allSessions
        ?.filter((s) => s.duration_min)
        .map((s) => s.duration_min) || [];
      const avgDuration = durationsArray.length > 0
        ? durationsArray.reduce((a, b) => a + b, 0) / durationsArray.length
        : 0;

      setStats({
        totalSessions,
        activeSessions,
        closedSessions,
        cancelledSessions,
        totalRevenue,
        avgDuration,
      });
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  }, [branchId]);

  // Cargar sesiones
  const loadSessions = useCallback(async () => {
    if (!branchId) return;

    setIsLoading(true);
    try {
      let query = supabase
        .from('parking_sessions')
        .select('*', { count: 'exact' })
        .eq('branch_id', branchId)
        .order('entry_at', { ascending: false });

      if (filters.search) {
        query = query.ilike('vehicle_plate', `%${filters.search}%`);
      }
      if (filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters.vehicleType !== 'all') {
        query = query.eq('vehicle_type', filters.vehicleType);
      }
      if (filters.dateFrom) {
        query = query.gte('entry_at', `${filters.dateFrom}T00:00:00`);
      }
      if (filters.dateTo) {
        query = query.lte('entry_at', `${filters.dateTo}T23:59:59`);
      }

      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      setSessions(data || []);
      setTotalItems(count || 0);
      await loadStats();
    } catch (err) {
      console.error('Error loading sessions:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las sesiones',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [branchId, filters, currentPage, pageSize, toast, loadStats]);

  // Cargar espacios
  const loadSpaces = useCallback(async () => {
    if (!branchId) return;

    try {
      const { data, error } = await supabase
        .from('parking_spaces')
        .select('id, label, state')
        .eq('branch_id', branchId)
        .order('label');

      if (error) throw error;
      setSpaces((data || []).map(s => ({ id: s.id, name: s.label, status: s.state })));
    } catch (err) {
      console.error('Error loading spaces:', err);
    }
  }, [branchId]);

  useEffect(() => {
    if (branchId) {
      loadSessions();
      loadSpaces();
    }
  }, [branchId, loadSessions, loadSpaces]);

  // Exportar CSV
  const exportCSV = async () => {
    if (!branchId) return;

    try {
      let query = supabase
        .from('parking_sessions')
        .select('*')
        .eq('branch_id', branchId)
        .order('entry_at', { ascending: false });

      if (filters.search) query = query.ilike('vehicle_plate', `%${filters.search}%`);
      if (filters.status !== 'all') query = query.eq('status', filters.status);
      if (filters.vehicleType !== 'all') query = query.eq('vehicle_type', filters.vehicleType);
      if (filters.dateFrom) query = query.gte('entry_at', `${filters.dateFrom}T00:00:00`);
      if (filters.dateTo) query = query.lte('entry_at', `${filters.dateTo}T23:59:59`);

      const { data, error } = await query;
      if (error) throw error;

      const headers = ['Placa', 'Tipo', 'Entrada', 'Salida', 'Duración (min)', 'Monto', 'Estado'];
      const rows = (data || []).map((s) => [
        s.vehicle_plate,
        s.vehicle_type,
        new Date(s.entry_at).toLocaleString('es-ES'),
        s.exit_at ? new Date(s.exit_at).toLocaleString('es-ES') : '',
        s.duration_min || '',
        s.amount || '',
        s.status,
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sesiones_parking_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast({
        title: 'Exportación exitosa',
        description: `Se exportaron ${data?.length || 0} registros`,
      });
    } catch (err) {
      console.error('Error exporting:', err);
      toast({
        title: 'Error',
        description: 'No se pudo exportar los datos',
        variant: 'destructive',
      });
    }
  };

  // Actualizar sesión
  const updateSession = async (
    sessionId: string,
    updates: {
      vehicle_plate: string;
      vehicle_type: string;
      parking_space_id: string | null;
      audit_reason: string;
    }
  ) => {
    const { error } = await supabase
      .from('parking_sessions')
      .update({
        vehicle_plate: updates.vehicle_plate,
        vehicle_type: updates.vehicle_type,
        parking_space_id: updates.parking_space_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (error) throw error;

    toast({
      title: 'Sesión actualizada',
      description: 'Los cambios se guardaron correctamente',
    });

    loadSessions();
  };

  const handleFiltersChange = (newFilters: SessionFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setFilters(initialFilters);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  return {
    // Estado
    organization,
    branchId,
    sessions,
    spaces,
    isLoading,
    filters,
    currentPage,
    pageSize,
    totalItems,
    stats,
    totalPages: Math.ceil(totalItems / pageSize),

    // Acciones
    loadSessions,
    exportCSV,
    updateSession,
    handleFiltersChange,
    handleClearFilters,
    handlePageChange,
    handlePageSizeChange,
  };
}

