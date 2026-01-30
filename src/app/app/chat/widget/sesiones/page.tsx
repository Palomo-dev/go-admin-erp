'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Wifi } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import WidgetSessionsService, { WidgetSession, SessionFilters, SessionStats } from '@/lib/services/widgetSessionsService';
import {
  SessionsHeader,
  SessionsFilters,
  SessionCard,
  SessionDetailDialog,
  SessionsPagination,
} from '@/components/chat/widget/sesiones';
import { ChatNavTabs } from '@/components/chat/ChatNavTabs';

export default function WidgetSessionsPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();

  const [sessions, setSessions] = useState<WidgetSession[]>([]);
  const [stats, setStats] = useState<SessionStats>({
    total: 0,
    active: 0,
    expired: 0,
    withCustomer: 0,
    anonymous: 0,
  });
  const [channels, setChannels] = useState<{ id: string; name: string; type: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<WidgetSession | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);

  const [filters, setFilters] = useState<SessionFilters>({
    status: 'all',
    channelId: undefined,
    hasCustomer: undefined,
    search: '',
  });

  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    setIsLoading(true);
    try {
      const service = new WidgetSessionsService(organization.id);

      const [sessionsData, statsData, channelsData] = await Promise.all([
        service.getSessions(filters),
        service.getStats(),
        service.getChannels(),
      ]);

      setSessions(sessionsData);
      setStats(statsData);
      setChannels(channelsData);
    } catch (error) {
      console.error('Error cargando sesiones:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las sesiones del widget',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, filters, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleBlockSession = async (session: WidgetSession) => {
    if (!organization?.id) return;

    try {
      const service = new WidgetSessionsService(organization.id);
      await service.blockSession(session.id);

      toast({
        title: 'Sesión bloqueada',
        description: 'La sesión ha sido bloqueada correctamente',
      });

      loadData();
    } catch (error) {
      console.error('Error bloqueando sesión:', error);
      toast({
        title: 'Error',
        description: 'No se pudo bloquear la sesión',
        variant: 'destructive',
      });
    }
  };

  const handleUnblockSession = async (session: WidgetSession) => {
    if (!organization?.id) return;

    try {
      const service = new WidgetSessionsService(organization.id);
      await service.unblockSession(session.id);

      toast({
        title: 'Sesión desbloqueada',
        description: 'La sesión ha sido desbloqueada correctamente',
      });

      loadData();
    } catch (error) {
      console.error('Error desbloqueando sesión:', error);
      toast({
        title: 'Error',
        description: 'No se pudo desbloquear la sesión',
        variant: 'destructive',
      });
    }
  };

  const handleViewDetails = (session: WidgetSession) => {
    setSelectedSession(session);
    setIsDetailOpen(true);
  };

  const handleFiltersChange = (newFilters: SessionFilters) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset a página 1 al cambiar filtros
  };

  const handleClearFilters = () => {
    setFilters({
      status: 'all',
      channelId: undefined,
      hasCustomer: undefined,
      search: '',
    });
    setCurrentPage(1);
  };

  // Calcular paginación
  const totalPages = Math.ceil(sessions.length / itemsPerPage);
  const paginatedSessions = sessions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Scroll al inicio de la lista
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  if (isLoading && sessions.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-500 dark:text-gray-400">Cargando sesiones...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <ChatNavTabs />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <SessionsHeader
        stats={stats}
        loading={isLoading}
        onRefresh={loadData}
      />

      <SessionsFilters
        filters={filters}
        channels={channels}
        onFiltersChange={handleFiltersChange}
        onClearFilters={handleClearFilters}
      />

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-gray-100 dark:bg-gray-800 p-4 mb-4">
            <Wifi className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            No hay sesiones
          </h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-md">
            No se encontraron sesiones del widget con los filtros actuales.
            Prueba a cambiar los filtros o espera a que los visitantes interactúen con el widget.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {paginatedSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onViewDetails={handleViewDetails}
                onBlock={handleBlockSession}
                onUnblock={handleUnblockSession}
              />
            ))}
          </div>

          <SessionsPagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={sessions.length}
            itemsPerPage={itemsPerPage}
            onPageChange={handlePageChange}
            onItemsPerPageChange={handleItemsPerPageChange}
          />
        </>
      )}

      <SessionDetailDialog
        session={selectedSession}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
      />
      </div>
    </div>
  );
}
