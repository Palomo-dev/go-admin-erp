'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { ChannelsHeader, ChannelsList } from '@/components/pms/origenes';
import ChannelsService, { type Channel, type ChannelStats } from '@/lib/services/channelsService';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Loader2 } from 'lucide-react';

export default function OrigenesPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [stats, setStats] = useState<ChannelStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [organization?.id]);

  const loadData = async () => {
    try {
      setIsLoading(true);

      const [channelsData, statsData] = await Promise.all([
        ChannelsService.getChannels(),
        ChannelsService.getChannelStats(organization?.id),
      ]);

      setChannels(channelsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los canales de reserva.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Cargando canales...</p>
        </div>
      </div>
    );
  }

  const totalReservations = stats.reduce((sum, s) => sum + s.total_reservations, 0);
  const totalRevenue = stats.reduce((sum, s) => sum + s.total_revenue, 0);
  const totalCommission = stats.reduce((sum, s) => {
    const channel = channels.find(c => c.id === s.channel);
    return sum + ChannelsService.calculateCommission(s.total_revenue, s.channel);
  }, 0);

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <ChannelsHeader />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Canales Activos
            </p>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
              {channels.filter(c => c.active).length}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Total Reservas
            </p>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">
              {totalReservations}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Ingresos Totales
            </p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
              ${totalRevenue.toLocaleString()}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Comisiones Totales
            </p>
            <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">
              ${totalCommission.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Channels List */}
        <ChannelsList channels={channels} stats={stats} />
      </div>
    </div>
  );
}
