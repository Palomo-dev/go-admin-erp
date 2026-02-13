'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import AttendanceService from '@/lib/services/attendanceService';
import type { AttendanceEventListItem } from '@/lib/services/attendanceService';
import { AttendanceTable, ManualEntryForm } from '@/components/hrm/marcacion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  RefreshCw,
  Hand,
  LogIn,
  LogOut,
  AlertTriangle,
  Clock,
  Cpu,
  Search,
  Calendar,
  Building2,
} from 'lucide-react';
import Link from 'next/link';

interface BranchOption {
  id: number;
  name: string;
}

interface EmployeeOption {
  id: string;
  name: string;
  code: string | null;
}

export default function MarcacionPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados
  const [events, setEvents] = useState<AttendanceEventListItem[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filtros
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');

  // Modal
  const [manualFormOpen, setManualFormOpen] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    checkIns: 0,
    checkOuts: 0,
    manual: 0,
    geoFailed: 0,
    withoutCheckout: 0,
  });

  // Servicio
  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new AttendanceService(organization.id);
  }, [organization?.id]);

  // Cargar datos
  const loadData = useCallback(async () => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      const branchId = branchFilter !== 'all' ? parseInt(branchFilter) : undefined;

      const [eventsData, branchesData, employeesData, statsData] = await Promise.all([
        service.getEvents({
          dateFrom: selectedDate,
          dateTo: selectedDate,
          branchId,
        }),
        service.getBranches(),
        service.getEmployees(),
        service.getStats(selectedDate),
      ]);

      setEvents(eventsData);
      setBranches(branchesData);
      setEmployees(employeesData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading attendance:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las marcaciones',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, selectedDate, branchFilter, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Filtrar eventos
  const filteredEvents = events.filter((e) => {
    const matchesSearch =
      e.employee_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.employee_code?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);

    const matchesType = eventTypeFilter === 'all' || e.event_type === eventTypeFilter;

    return matchesSearch && matchesType;
  });

  // Handlers
  const handleManualEntry = async (data: {
    employment_id: string;
    event_type: string;
    event_at: string;
    reason: string;
    branch_id?: number;
  }) => {
    const service = getService();
    if (!service) return;

    await service.createManualEntry(
      data.employment_id,
      data.event_type,
      data.event_at,
      data.reason,
      data.branch_id
    );

    toast({
      title: 'Marcación registrada',
      description: 'La marcación manual se registró correctamente',
    });

    await loadData();
  };

  // Auto-refresh cada 30 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      if (selectedDate === format(new Date(), 'yyyy-MM-dd')) {
        loadData();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [loadData, selectedDate]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted || orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const isToday = selectedDate === format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Clock className="h-7 w-7 text-blue-600" />
            Marcaciones
            {isToday && (
              <span className="text-sm font-normal text-green-600 dark:text-green-400 flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                En vivo
              </span>
            )}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {format(new Date(selectedDate), "EEEE, d 'de' MMMM yyyy", { locale: es })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button size="sm" onClick={() => setManualFormOpen(true)}>
            <Hand className="h-4 w-4 mr-2" />
            Entrada Manual
          </Button>
          <Link href="/app/hrm/marcacion/dispositivos">
            <Button variant="outline" size="sm">
              <Cpu className="h-4 w-4 mr-2" />
              Dispositivos
            </Button>
          </Link>
          <Link href="/app/hrm/asistencia/timesheets">
            <Button variant="outline" size="sm">
              Timesheets
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.total}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <LogIn className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {stats.checkIns}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Entradas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <LogOut className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {stats.checkOuts}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Salidas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Hand className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {stats.manual}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Manuales</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {stats.geoFailed}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Fuera Zona</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {stats.withoutCheckout}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Sin Salida</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-[160px] bg-white dark:bg-gray-900"
              />
            </div>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="w-[180px] bg-white dark:bg-gray-900">
                <Building2 className="h-4 w-4 mr-2 text-gray-400" />
                <SelectValue placeholder="Sede" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las sedes</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id.toString()}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
              <SelectTrigger className="w-[150px] bg-white dark:bg-gray-900">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="check_in">Entradas</SelectItem>
                <SelectItem value="check_out">Salidas</SelectItem>
                <SelectItem value="break_start">Descansos</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar empleado..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-white dark:bg-gray-900"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <AttendanceTable events={filteredEvents} isLoading={isLoading} />
        </CardContent>
      </Card>

      {/* Manual Entry Modal */}
      <ManualEntryForm
        open={manualFormOpen}
        onOpenChange={setManualFormOpen}
        employees={employees}
        branches={branches}
        onSubmit={handleManualEntry}
      />
    </div>
  );
}
