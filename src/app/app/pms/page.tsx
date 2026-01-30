'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import PMSDashboardService, {
  type DashboardStats as DashboardStatsType,
  type Alert,
  type TodayArrival,
  type TodayDeparture,
  type CalendarEvent,
} from '@/lib/services/pmsDashboardService';
import {
  DashboardStats,
  AlertsPanel,
  ArrivalsCard,
  DeparturesCard,
  MiniCalendar,
  QuickActions,
  DateFilter,
  getDateRangeFromPreset,
  type DateRange,
  type DatePreset,
} from '@/components/pms/dashboard';
import { Button } from '@/components/ui/button';
import { RefreshCw, Building2 } from 'lucide-react';

export default function PmsPage() {
  const router = useRouter();
  const { organization } = useOrganization();
  const { toast } = useToast();

  // Date filter state
  const [dateRange, setDateRange] = useState<DateRange>(getDateRangeFromPreset('today'));
  const [activePreset, setActivePreset] = useState<DatePreset>('today');

  const [stats, setStats] = useState<DashboardStatsType>({
    arrivalsToday: 0,
    departuresToday: 0,
    occupancy: 0,
    available: 0,
    cleaning: 0,
    maintenance: 0,
    totalSpaces: 0,
  });
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [arrivals, setArrivals] = useState<TodayArrival[]>([]);
  const [departures, setDepartures] = useState<TodayDeparture[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadDashboardData = useCallback(async (range: DateRange) => {
    if (!organization?.id) return;

    try {
      const [statsData, alertsData, arrivalsData, departuresData, eventsData] = await Promise.all([
        PMSDashboardService.getDashboardStats(organization.id, range),
        PMSDashboardService.getAlerts(organization.id),
        PMSDashboardService.getArrivals(organization.id, range),
        PMSDashboardService.getDepartures(organization.id, range),
        PMSDashboardService.getWeekCalendarEvents(organization.id),
      ]);

      setStats(statsData);
      setAlerts(alertsData);
      setArrivals(arrivalsData);
      setDepartures(departuresData);
      setCalendarEvents(eventsData);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del dashboard',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [organization?.id, toast]);

  useEffect(() => {
    if (organization?.id) {
      loadDashboardData(dateRange);
    }
  }, [organization?.id, loadDashboardData, dateRange]);

  const handleDateRangeChange = (range: DateRange, preset: DatePreset) => {
    setDateRange(range);
    setActivePreset(preset);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadDashboardData(dateRange);
    toast({
      title: 'Actualizado',
      description: 'Los datos del dashboard han sido actualizados',
    });
  };

  const handleCheckIn = (reservationId: string) => {
    router.push(`/app/pms/checkin?id=${reservationId}`);
  };

  const handleCheckOut = (reservationId: string) => {
    router.push(`/app/pms/checkout?id=${reservationId}`);
  };

  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Building2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Panel de Control PMS
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
                    {today}
                  </p>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="self-start md:self-auto"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>
          
          {/* Date Filters */}
          <DateFilter
            dateRange={dateRange}
            onDateRangeChange={handleDateRangeChange}
          />
        </div>

        {/* Stats */}
        <DashboardStats
          arrivalsToday={stats.arrivalsToday}
          departuresToday={stats.departuresToday}
          occupancy={stats.occupancy}
          available={stats.available}
          cleaning={stats.cleaning}
          maintenance={stats.maintenance}
          totalSpaces={stats.totalSpaces}
          isLoading={isLoading}
        />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Arrivals & Departures */}
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ArrivalsCard
                arrivals={arrivals}
                isLoading={isLoading}
                onCheckIn={handleCheckIn}
              />
              <DeparturesCard
                departures={departures}
                isLoading={isLoading}
                onCheckOut={handleCheckOut}
              />
            </div>

            {/* Alerts */}
            <AlertsPanel alerts={alerts} isLoading={isLoading} />
          </div>

          {/* Right Column - Calendar & Quick Actions */}
          <div className="space-y-6">
            <QuickActions />
            <MiniCalendar events={calendarEvents} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </div>
  );
}
