'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Users, LogIn, RefreshCw, QrCode, Building2, Search, Filter, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/gym/shared';
import { 
  CheckinSearch, 
  CheckinResult, 
  CheckinHistory,
  DateRangeFilter,
  CheckinStats 
} from '@/components/gym/checkin';
import { Membership, MemberCheckin } from '@/lib/services/gymService';
import { 
  GymCheckinService, 
  DateRangePreset, 
  getDateRange,
  CheckinStats as CheckinStatsType,
  MemberWithMembership
} from '@/lib/services/gymCheckinService';
import { useOrganization, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';

export default function GymCheckinPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { organization, isLoading: orgLoading } = useOrganization();
  
  // Estados de búsqueda y validación
  const [isSearching, setIsSearching] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchResults, setSearchResults] = useState<MemberWithMembership[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberWithMembership | null>(null);
  const [validationResult, setValidationResult] = useState<{ 
    valid: boolean; 
    reason?: string;
    isExpiring?: boolean;
    daysUntilExpiry?: number;
  } | null>(null);
  
  // Estados de historial y filtros
  const [checkins, setCheckins] = useState<MemberCheckin[]>([]);
  const [stats, setStats] = useState<CheckinStatsType>({
    total: 0,
    granted: 0,
    denied: 0,
    manual: 0,
    qr: 0,
    uniqueMembers: 0,
    expiringToday: 0,
    expiredAccess: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  
  // Filtros
  const [datePreset, setDatePreset] = useState<DateRangePreset>('today');
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Datos auxiliares
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [expiringToday, setExpiringToday] = useState<Membership[]>([]);

  // Servicio
  const service = useMemo(() => {
    if (!organization?.id) return null;
    const branchId = branchFilter !== 'all' ? parseInt(branchFilter) : undefined;
    return new GymCheckinService(organization.id, branchId);
  }, [organization?.id, branchFilter]);

  // Cargar datos
  const loadData = useCallback(async () => {
    if (!service) return;
    
    setIsLoading(true);
    try {
      const { from, to } = getDateRange(datePreset, customFrom, customTo);
      
      const [checkinsData, statsData, branchesData, expiringData] = await Promise.all([
        service.getCheckins({
          dateFrom: from.toISOString(),
          dateTo: to.toISOString(),
          method: methodFilter !== 'all' ? methodFilter : undefined,
          status: statusFilter as 'granted' | 'denied' | 'all',
        }),
        service.getCheckinStats({
          dateFrom: from.toISOString(),
          dateTo: to.toISOString(),
        }),
        service.getBranches(),
        service.getExpiringToday(),
      ]);
      
      setCheckins(checkinsData);
      setStats(statsData);
      setBranches(branchesData);
      setExpiringToday(expiringData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos de check-in',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [service, datePreset, customFrom, customTo, methodFilter, statusFilter, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Auto-refresh cada 30 segundos si es "hoy"
  useEffect(() => {
    if (datePreset !== 'today') return;
    
    const interval = setInterval(() => {
      loadData();
    }, 30000);

    return () => clearInterval(interval);
  }, [datePreset, loadData]);

  // Filtrar checkins por término de búsqueda
  const filteredCheckins = useMemo(() => {
    if (!searchTerm) return checkins;
    const term = searchTerm.toLowerCase();
    return checkins.filter(c => {
      const customer = c.customers as { 
        id?: string; 
        first_name?: string; 
        last_name?: string; 
        document_number?: string;
        phone?: string;
      } | null;
      return (
        customer?.first_name?.toLowerCase().includes(term) ||
        customer?.last_name?.toLowerCase().includes(term) ||
        customer?.document_number?.toLowerCase().includes(term) ||
        customer?.phone?.toLowerCase().includes(term)
      );
    });
  }, [checkins, searchTerm]);

  const handleSearch = async (query: string) => {
    if (!service) return;
    
    try {
      setIsSearching(true);
      setSelectedMember(null);
      setValidationResult(null);
      setSearchResults([]);

      const results = await service.searchMember(query);
      
      if (results.length === 0) {
        toast({
          title: 'No encontrado',
          description: 'No se encontró ningún miembro con esos datos',
          variant: 'destructive'
        });
        return;
      }

      if (results.length === 1) {
        await selectMember(results[0]);
      } else {
        setSearchResults(results);
      }
    } catch (error) {
      console.error('Error buscando:', error);
      toast({
        title: 'Error',
        description: 'Error al buscar miembro',
        variant: 'destructive'
      });
    } finally {
      setIsSearching(false);
    }
  };

  const selectMember = async (member: MemberWithMembership) => {
    if (!service) return;
    
    setSelectedMember(member);
    setSearchResults([]);
    
    const validation = await service.validateAccess(member.membership.id);
    setValidationResult(validation);
  };

  const handleCheckin = async () => {
    if (!selectedMember || !service) return;

    try {
      setIsProcessing(true);
      await service.registerCheckin(selectedMember.membership.id, 'manual');
      
      toast({
        title: '✅ Check-in registrado',
        description: `${selectedMember.customer.first_name} ${selectedMember.customer.last_name}`,
      });

      setSelectedMember(null);
      setValidationResult(null);
      loadData();
    } catch (error) {
      console.error('Error registrando check-in:', error);
      toast({
        title: 'Error',
        description: 'Error al registrar check-in',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeny = async (reason: string) => {
    if (!selectedMember || !service) return;

    try {
      setIsProcessing(true);
      await service.registerDeniedAccess(selectedMember.membership.id, reason);
      
      toast({
        title: 'Acceso denegado registrado',
        description: reason,
        variant: 'destructive'
      });

      setSelectedMember(null);
      setValidationResult(null);
      loadData();
    } catch (error) {
      console.error('Error registrando denegación:', error);
      toast({
        title: 'Error',
        description: 'Error al registrar denegación',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRenew = () => {
    if (!selectedMember) return;
    router.push(`/app/gym/membresias/${selectedMember.membership.id}?action=renew`);
  };

  const clearSearch = () => {
    setSelectedMember(null);
    setValidationResult(null);
    setSearchResults([]);
  };

  const isToday = datePreset === 'today';

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <LogIn className="h-7 w-7 text-blue-600" />
            Check-in Gimnasio
            {isToday && (
              <span className="text-sm font-normal text-green-600 dark:text-green-400 flex items-center gap-1 ml-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                En vivo
              </span>
            )}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Control de acceso y registro de entradas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Link href="/app/gym/dispositivos">
            <Button variant="outline" size="sm">
              <QrCode className="h-4 w-4 mr-2" />
              Dispositivos
            </Button>
          </Link>
        </div>
      </div>

      {/* Estadísticas - Full width */}
      <CheckinStats stats={stats} isLoading={isLoading} />

      {/* Alerta de membresías que vencen hoy */}
      {expiringToday.length > 0 && (
        <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
          <CardContent className="py-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
              <div className="flex-1">
                <span className="font-medium text-yellow-800 dark:text-yellow-200">
                  {expiringToday.length} membresía(s) vencen hoy:
                </span>
                <span className="text-yellow-700 dark:text-yellow-300 ml-2">
                  {expiringToday.slice(0, 3).map((m) => 
                    `${m.customers?.first_name} ${m.customers?.last_name}`
                  ).join(', ')}
                  {expiringToday.length > 3 && ` y ${expiringToday.length - 3} más...`}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contenido principal */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Columna izquierda - Búsqueda y validación */}
        <div className="space-y-6">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Search className="h-5 w-5 text-blue-600" />
                Buscar Miembro
              </h2>
              <CheckinSearch 
                onSearch={handleSearch}
                isLoading={isSearching}
              />
            </CardContent>
          </Card>

          {/* Resultados múltiples */}
          {searchResults.length > 1 && (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Seleccionar miembro ({searchResults.length} encontrados)
                </h3>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {searchResults.map((member) => (
                    <button
                      key={member.membership.id}
                      onClick={() => selectMember(member)}
                      className="w-full flex items-center gap-4 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                    >
                      <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
                        <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 dark:text-white">
                          {member.customer.first_name} {member.customer.last_name}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {member.membership_plan?.name} • {member.membership.access_code}
                        </p>
                        {!member.canAccess && (
                          <Badge variant="destructive" className="mt-1">
                            {member.accessReason}
                          </Badge>
                        )}
                        {member.isExpiring && member.canAccess && (
                          <Badge className="mt-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                            Vence en {member.daysUntilExpiry} días
                          </Badge>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Resultado de validación */}
          {selectedMember && validationResult && (
            <div className="space-y-4">
              <CheckinResult
                membership={selectedMember.membership}
                validationResult={validationResult}
                onCheckin={handleCheckin}
                onDeny={handleDeny}
                onRenew={handleRenew}
                isProcessing={isProcessing}
              />
              
              <Button
                variant="outline"
                onClick={clearSearch}
                className="w-full"
              >
                Nueva búsqueda
              </Button>
            </div>
          )}
        </div>

        {/* Columna derecha - Historial */}
        <div className="space-y-6">
          {/* Filtros */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <DateRangeFilter
                  preset={datePreset}
                  customFrom={customFrom}
                  customTo={customTo}
                  onPresetChange={setDatePreset}
                  onCustomRangeChange={(from, to) => {
                    setCustomFrom(from);
                    setCustomTo(to);
                  }}
                />
                
                <div className="flex items-center gap-2 ml-auto">
                  <Select value={branchFilter} onValueChange={setBranchFilter}>
                    <SelectTrigger className="w-[140px] bg-white dark:bg-gray-900">
                      <Building2 className="h-4 w-4 mr-2 text-gray-400" />
                      <SelectValue placeholder="Sede" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id.toString()}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[130px] bg-white dark:bg-gray-900">
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="granted">Accesos</SelectItem>
                      <SelectItem value="denied">Denegados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar por nombre, documento..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 bg-white dark:bg-gray-900"
                />
              </div>
            </CardContent>
          </Card>

          {/* Historial de check-ins */}
          <CheckinHistory 
            checkins={filteredCheckins}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
