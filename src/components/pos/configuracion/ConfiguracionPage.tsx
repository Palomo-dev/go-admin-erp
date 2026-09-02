'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { PageHeaderSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import {
  Settings,
  CreditCard,
  Percent,
  Hash,
  RefreshCw,
  ArrowLeft,
  ChevronRight,
  DollarSign,
  Receipt,
  Calculator,
  LayoutGrid,
  Image as ImageIcon,
  Search,
  Printer,
  Monitor,
  Wallet,
  Clock,
  Users,
} from 'lucide-react';
import { formatCurrency, formatPercent } from '@/utils/Utils';
import { SearchSelect } from '@/components/ui/search-select';
import { cn } from '@/utils/Utils';
import {
  ConfiguracionService,
  OrganizationPaymentMethod,
  OrganizationTax,
  ServiceCharge,
  ConfigStats,
  PosCategoriesDisplayConfig,
  defaultCategoriesDisplayConfig,
  PosRequireCashSessionConfig,
  defaultRequireCashSessionConfig,
  PosBlindCashCountConfig,
  defaultBlindCashCountConfig,
  PosCashSessionModeConfig,
  defaultCashSessionModeConfig,
} from './configuracionService';
import { CajasService } from '@/components/pos/cajas/CajasService';
import { PrintersSection } from './printers/PrintersSection';
import { PrintAgentStatusCard } from './printers/PrintAgentStatusCard';
import { RecentPrintJobsTable } from './printers/RecentPrintJobsTable';
import { useOrganization } from '@/lib/hooks/useOrganization';
import {
  getOperatingHours,
  invalidateOperatingHoursCache,
  type OperatingHours,
} from '@/lib/services/organizationOperatingHoursService';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ConsecutivosModal,
  PropinasModal,
  CargosModal,
  ImpresionesModal,
  AgenteModal,
} from './ConfigModals';

export function ConfiguracionPage({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useToast();
  const { branch_id, organization } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Datos
  const [stats, setStats] = useState<ConfigStats | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<OrganizationPaymentMethod[]>([]);
  const [taxes, setTaxes] = useState<OrganizationTax[]>([]);
  const [serviceCharges, setServiceCharges] = useState<ServiceCharge[]>([]);
  const [categoriesDisplay, setCategoriesDisplay] = useState<PosCategoriesDisplayConfig>(defaultCategoriesDisplayConfig);
  const [savingCategoriesDisplay, setSavingCategoriesDisplay] = useState(false);
  const [requireCashSession, setRequireCashSession] = useState<PosRequireCashSessionConfig>(defaultRequireCashSessionConfig);
  const [savingRequireCash, setSavingRequireCash] = useState(false);
  const [blindCashCount, setBlindCashCount] = useState<PosBlindCashCountConfig>(defaultBlindCashCountConfig);
  const [savingBlindCash, setSavingBlindCash] = useState(false);
  const [cashSessionMode, setCashSessionMode] = useState<PosCashSessionModeConfig>(defaultCashSessionModeConfig);
  const [savingCashMode, setSavingCashMode] = useState(false);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);

  // Horas de operación (día operativo para empresas con horarios no estándar)
  const [operatingHours, setOperatingHours] = useState<OperatingHours | null>(null);
  const [ohEnabled, setOhEnabled] = useState(false);
  const [ohStart, setOhStart] = useState('08:00');
  const [ohEnd, setOhEnd] = useState('18:00');
  const [savingOperatingHours, setSavingOperatingHours] = useState(false);

  const [showConsecutivos, setShowConsecutivos] = useState(false);
  const [showPropinas, setShowPropinas] = useState(false);
  const [showCargos, setShowCargos] = useState(false);
  const [showImpresiones, setShowImpresiones] = useState(false);
  const [showAgente, setShowAgente] = useState(false);

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [statsData, paymentsData, taxesData, chargesData, categoriesDisplayData, branchesData, requireCashData, blindCashData, cashModeData, ohData] = await Promise.all([
        ConfiguracionService.getConfigStats(),
        ConfiguracionService.getPaymentMethods(),
        ConfiguracionService.getTaxes(),
        ConfiguracionService.getServiceCharges(),
        ConfiguracionService.getCategoriesDisplayConfig(),
        ConfiguracionService.getBranches(),
        ConfiguracionService.getRequireCashSessionConfig(),
        ConfiguracionService.getBlindCashCountConfig(),
        ConfiguracionService.getCashSessionModeConfig(),
        organization?.id ? getOperatingHours(organization.id) : Promise.resolve(null),
      ]);

      setStats(statsData);
      setPaymentMethods(paymentsData);
      setTaxes(taxesData);
      setServiceCharges(chargesData);
      setCategoriesDisplay(categoriesDisplayData);
      setBranches(branchesData);
      setRequireCashSession(requireCashData);
      setBlindCashCount(blindCashData);
      setCashSessionMode(cashModeData);
      // Invalidar cache de modo de cajas en CajasService para que tome el valor fresco
      CajasService.invalidateCashSessionModeCache();
      setOperatingHours(ohData);
      setOhEnabled(ohData?.enabled ?? false);
      setOhStart(ohData?.start_time ?? '08:00');
      setOhEnd(ohData?.end_time ?? '18:00');
    } catch (error) {
      console.error('Error cargando configuración:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la configuración',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTogglePaymentMethod = async (id: number, currentState: boolean) => {
    try {
      await ConfiguracionService.togglePaymentMethod(id, !currentState);
      toast({ title: 'Actualizado', description: 'Método de pago actualizado' });
      loadData(true);
    } catch {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el método de pago',
        variant: 'destructive',
      });
    }
  };

  const handleToggleServiceCharge = async (id: number, currentState: boolean) => {
    try {
      await ConfiguracionService.toggleServiceCharge(id, !currentState);
      toast({ title: 'Actualizado', description: 'Cargo de servicio actualizado' });
      loadData(true);
    } catch {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el cargo de servicio',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateCategoriesDisplay = async (config: Partial<PosCategoriesDisplayConfig>) => {
    const previous = categoriesDisplay;
    const merged = { ...categoriesDisplay, ...config };
    setCategoriesDisplay(merged);
    setSavingCategoriesDisplay(true);
    try {
      await ConfiguracionService.saveCategoriesDisplayConfig(config);
      toast({ title: 'Actualizado', description: 'Visualización de categorías actualizada' });
    } catch {
      setCategoriesDisplay(previous);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la visualización de categorías',
        variant: 'destructive',
      });
    } finally {
      setSavingCategoriesDisplay(false);
    }
  };

  const handleToggleBlindCashCount = async (value: boolean) => {
    const previous = blindCashCount;
    setBlindCashCount({ blind_cash_count: value });
    setSavingBlindCash(true);
    try {
      await ConfiguracionService.saveBlindCashCountConfig({ blind_cash_count: value });
      toast({ title: 'Actualizado', description: value ? 'Arqueo ciego activado' : 'Arqueo ciego desactivado' });
    } catch {
      setBlindCashCount(previous);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la configuración',
        variant: 'destructive',
      });
    } finally {
      setSavingBlindCash(false);
    }
  };

  const handleToggleRequireCashSession = async (value: boolean) => {
    const previous = requireCashSession;
    setRequireCashSession({ require_cash_session: value });
    setSavingRequireCash(true);
    try {
      await ConfiguracionService.saveRequireCashSessionConfig({ require_cash_session: value });
      toast({ title: 'Actualizado', description: value ? 'Se requiere caja abierta para vender' : 'Venta sin caja abierta permitida' });
    } catch {
      setRequireCashSession(previous);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la configuración',
        variant: 'destructive',
      });
    } finally {
      setSavingRequireCash(false);
    }
  };

  const handleToggleCashSessionMode = async (value: boolean) => {
    const previous = cashSessionMode;
    const newMode: PosCashSessionModeConfig['mode'] = value ? 'user' : 'branch';
    setCashSessionMode({ mode: newMode });
    setSavingCashMode(true);
    try {
      await ConfiguracionService.saveCashSessionModeConfig({ mode: newMode });
      // Invalidar cache de CajasService para que el nuevo modo se aplique de inmediato
      CajasService.invalidateCashSessionModeCache();
      toast({
        title: 'Actualizado',
        description: value
          ? 'Caja por cajero activada: cada miembro gestiona su propia caja'
          : 'Caja por sucursal activada: una sola caja compartida por sucursal',
      });
    } catch {
      setCashSessionMode(previous);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la configuración',
        variant: 'destructive',
      });
    } finally {
      setSavingCashMode(false);
    }
  };

  // Guardar horas de operación en organization_settings
  const handleSaveOperatingHours = async () => {
    if (!organization?.id) return;
    setSavingOperatingHours(true);
    try {
      const { supabase } = await import('@/lib/supabase/config');
      const settings = ohEnabled
        ? { enabled: true, start_time: ohStart, end_time: ohEnd }
        : { enabled: false, start_time: ohStart, end_time: ohEnd };

      const { error } = await supabase
        .from('organization_settings')
        .upsert({
          organization_id: organization.id,
          key: 'operating_hours',
          settings,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'organization_id,key',
        });

      if (error) throw error;

      // Invalidar cache para que los reportes/dashboard tomen el cambio
      invalidateOperatingHoursCache(organization.id);
      setOperatingHours(ohEnabled ? { enabled: true, start_time: ohStart, end_time: ohEnd } : null);

      toast({
        title: 'Horas de operación guardadas',
        description: ohEnabled
          ? `Día operativo: ${ohStart} a ${ohEnd}${ohStart >= ohEnd ? ' (cruza medianoche)' : ''}`
          : 'Día calendario completo (00:00 - 23:59)',
      });
    } catch (error) {
      console.error('Error guardando operating hours:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron guardar las horas de operación',
        variant: 'destructive',
      });
    } finally {
      setSavingOperatingHours(false);
    }
  };

  const getPaymentMethodName = (code: string): string => {
    const names: Record<string, string> = {
      cash: 'Efectivo',
      card: 'Tarjeta',
      credit_card: 'Tarjeta Crédito',
      debit_card: 'Tarjeta Débito',
      transfer: 'Transferencia',
      nequi: 'Nequi',
      daviplata: 'Daviplata',
      pse: 'PSE',
      credit: 'Crédito',
    };
    return names[code] || code;
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <CardListSkeleton cards={4} columns="1" />
      </div>
    );
  }

  return (
    <div className={embedded ? "space-y-6" : "min-h-screen bg-gray-50 dark:bg-gray-900 p-6 space-y-6"}>
      {/* Header - hidden when embedded */}
      {!embedded && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3 flex-wrap">
            <Link href="/app/pos">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex flex-wrap items-center gap-3 min-w-0">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                  <Settings className="h-6 w-6 text-blue-600" />
                </div>
                Configuración POS
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                POS / Configuración
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => loadData(true)} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <CreditCard className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.paymentMethods || 0}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Métodos de Pago</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Percent className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.taxes || 0}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Impuestos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <DollarSign className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.serviceCharges || 0}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Cargos Servicio</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <Receipt className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.invoiceSequences || 0}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Sec. Facturación</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg">
                <Hash className="h-5 w-5 text-cyan-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.saleSequences || 0}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Sec. Ventas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Enlaces Rápidos */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            Configuración Avanzada
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Accede a configuraciones específicas del sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <button type="button" onClick={() => setShowConsecutivos(true)} className="text-left p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer group w-full">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg shrink-0">
                    <Hash className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white break-words">Consecutivos de Ventas</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 break-words">Prefijos, padding, reset</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-blue-600 transition-colors shrink-0" />
              </div>
            </button>

            <button type="button" onClick={() => setShowPropinas(true)} className="text-left p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer group w-full">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg shrink-0">
                    <DollarSign className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white break-words">Propinas</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 break-words">Configurar propinas</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-green-600 transition-colors shrink-0" />
              </div>
            </button>

            <button type="button" onClick={() => setShowCargos(true)} className="text-left p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer group w-full">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg shrink-0">
                    <Calculator className="h-5 w-5 text-purple-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white break-words">Cargos de Servicio</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 break-words">Configurar cargos</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-purple-600 transition-colors shrink-0" />
              </div>
            </button>

            <button type="button" onClick={() => setShowImpresiones(true)} className="text-left p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer group w-full">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg shrink-0">
                    <Printer className="h-5 w-5 text-cyan-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white break-words">Previsualizar Impresiones</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 break-words">Ver tickets antes de imprimir</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-cyan-600 transition-colors shrink-0" />
              </div>
            </button>

            <button type="button" onClick={() => setShowAgente(true)} className="text-left p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer group w-full">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg shrink-0">
                    <Monitor className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white break-words">Agente de Impresión</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 break-words">Estado y configuración del agente</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-indigo-600 transition-colors shrink-0" />
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Requerir caja abierta para vender */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Wallet className="h-5 w-5 text-orange-600" />
            Requerir Caja Abierta
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Obliga a tener una caja abierta para poder realizar ventas en POS y Mesas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="min-w-0">
              <p className="font-medium text-gray-900 dark:text-white break-words">
                Bloquear ventas sin caja abierta
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 break-words">
                {requireCashSession.require_cash_session
                  ? 'Las ventas están bloqueadas hasta abrir caja'
                  : 'Las ventas están permitidas sin caja abierta'}
              </p>
            </div>
            <Switch
              checked={requireCashSession.require_cash_session}
              onCheckedChange={handleToggleRequireCashSession}
              disabled={savingRequireCash}
            />
          </div>
        </CardContent>
      </Card>

      {/* Caja por Cajero (modo de asignación de cajas) */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-teal-600" />
            Caja por Cajero
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Define si la caja es única por sucursal (compartida por todos los cajeros) o si cada miembro de la organización abre y gestiona su propia caja dentro de la sucursal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="min-w-0">
              <p className="font-medium text-gray-900 dark:text-white break-words">
                Una caja por cajero
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 break-words">
                {cashSessionMode.mode === 'user'
                  ? 'Cada miembro abre su propia caja, registra sus ventas y hace su cierre de forma independiente'
                  : 'Una sola caja compartida por sucursal (todos los cajeros registran en la misma caja)'}
              </p>
            </div>
            <Switch
              checked={cashSessionMode.mode === 'user'}
              onCheckedChange={handleToggleCashSessionMode}
              disabled={savingCashMode}
            />
          </div>
          {cashSessionMode.mode === 'user' && (
            <div className="mt-3 p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg border border-teal-200 dark:border-teal-800">
              <p className="text-sm text-teal-800 dark:text-teal-200">
                <strong>Modo cajero activo:</strong> en cada sucursal, cada miembro puede tener una caja abierta simultáneamente. El resumen y cierre de cada caja incluyen únicamente las ventas y movimientos del cajero que la abrió.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Arqueo Ciego */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Calculator className="h-5 w-5 text-purple-600" />
            Cierre Ciego
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Oculta los montos esperados y diferencias al cajero durante el cierre. Solo los administradores pueden ver esta informacion
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="min-w-0">
              <p className="font-medium text-gray-900 dark:text-white break-words">
                Activar cierre ciego
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 break-words">
                {blindCashCount.blind_cash_count
                  ? 'El cajero no ve los montos esperados ni las diferencias'
                  : 'El cajero puede ver los montos esperados y diferencias'}
              </p>
            </div>
            <Switch
              checked={blindCashCount.blind_cash_count}
              onCheckedChange={handleToggleBlindCashCount}
              disabled={savingBlindCash}
            />
          </div>
        </CardContent>
      </Card>

      {/* Horas de Operación (Día Operativo) */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Clock className="h-5 w-5 text-cyan-600" />
            Horas de Operación
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Define el horario del &ldquo;día operativo&rdquo; para reportes y dashboard. Para empresas que trabajan de noche (ej: 8pm a 3am), esto delimita correctamente el inicio y cierre del día.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Toggle activar/desactivar */}
          <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="min-w-0">
              <p className="font-medium text-gray-900 dark:text-white break-words">
                Activar horas de operación personalizadas
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 break-words">
                {ohEnabled
                  ? `Día operativo: ${ohStart} a ${ohEnd}${ohStart >= ohEnd ? ' (cruza medianoche)' : ''}`
                  : 'Día calendario completo (00:00 - 23:59)'}
              </p>
            </div>
            <Switch
              checked={ohEnabled}
              onCheckedChange={setOhEnabled}
              disabled={savingOperatingHours}
            />
          </div>

          {/* Selectores de hora (visibles cuando está activado) */}
          {ohEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
              <div className="space-y-2">
                <Label htmlFor="oh-start" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Hora de inicio
                </Label>
                <Input
                  id="oh-start"
                  type="time"
                  value={ohStart}
                  onChange={(e) => setOhStart(e.target.value)}
                  disabled={savingOperatingHours}
                  className="bg-white dark:bg-gray-900"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Inicio del día operativo
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="oh-end" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Hora de cierre
                </Label>
                <Input
                  id="oh-end"
                  type="time"
                  value={ohEnd}
                  onChange={(e) => setOhEnd(e.target.value)}
                  disabled={savingOperatingHours}
                  className="bg-white dark:bg-gray-900"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Fin del día operativo. Si es menor al inicio, cruza medianoche.
                </p>
              </div>
              <div className="sm:col-span-2">
                <Button
                  onClick={handleSaveOperatingHours}
                  disabled={savingOperatingHours}
                  size="sm"
                >
                  {savingOperatingHours ? 'Guardando...' : 'Guardar horas de operación'}
                </Button>
              </div>
            </div>
          )}

          {!ohEnabled && operatingHours === null && (
            <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
              <Button
                onClick={handleSaveOperatingHours}
                disabled={savingOperatingHours}
                size="sm"
                variant="outline"
              >
                {savingOperatingHours ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visualización de Categorías POS */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-indigo-600" />
            Visualización de Categorías
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Define cómo se muestran las categorías al buscar productos en el POS y en Mesas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Modo de visualización</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { value: 'searchselect' as const, label: 'Buscador', description: 'Lista desplegable con búsqueda', icon: Search },
                { value: 'buttons' as const, label: 'Botones', description: 'Chips con icono y color', icon: LayoutGrid },
                { value: 'images' as const, label: 'Imágenes', description: 'Tarjetas con imagen de fondo', icon: ImageIcon },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={savingCategoriesDisplay}
                  onClick={() => handleUpdateCategoriesDisplay({ mode: opt.value })}
                  className={cn(
                    'p-4 rounded-lg border-2 text-left transition-colors',
                    categoriesDisplay.mode === opt.value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                      : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300'
                  )}
                >
                  <opt.icon className={cn('h-5 w-5 mb-2', categoriesDisplay.mode === opt.value ? 'text-indigo-600' : 'text-gray-400')} />
                  <p className="font-medium text-gray-900 dark:text-white text-sm">{opt.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{opt.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Orden de las categorías</p>
            <SearchSelect
              options={[
                { value: 'display_order', label: 'Orden de visualización (display_order)' },
                { value: 'rank', label: 'Rango (rank)' },
                { value: 'name', label: 'Nombre (A-Z)' },
              ]}
              value={categoriesDisplay.orderBy}
              onValueChange={(value) => handleUpdateCategoriesDisplay({ orderBy: value as PosCategoriesDisplayConfig['orderBy'] })}
              placeholder="Selecciona el orden"
              className="w-full sm:w-80"
              disabled={savingCategoriesDisplay}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              El orden y colores/iconos se configuran por categoría en Inventario → Categorías
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Métodos de Pago */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-600" />
            Métodos de Pago
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Métodos de pago habilitados para la organización
          </CardDescription>
        </CardHeader>
        <CardContent>
          {paymentMethods.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
              No hay métodos de pago configurados
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paymentMethods.map((pm) => (
                <div 
                  key={pm.id} 
                  className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {getPaymentMethodName(pm.payment_method_code)}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {pm.payment_methods?.requires_reference ? 'Requiere referencia' : 'Sin referencia'}
                    </p>
                  </div>
                  <Switch
                    checked={pm.is_active}
                    onCheckedChange={() => handleTogglePaymentMethod(pm.id, pm.is_active)}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Impuestos */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Percent className="h-5 w-5 text-green-600" />
            Impuestos
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Impuestos configurados para la organización
          </CardDescription>
        </CardHeader>
        <CardContent>
          {taxes.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
              No hay impuestos configurados
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Nombre</th>
                    <th className="text-right py-2 px-3 text-gray-600 dark:text-gray-400">Tasa</th>
                    <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Descripción</th>
                    <th className="text-center py-2 px-3 text-gray-600 dark:text-gray-400">Por Defecto</th>
                    <th className="text-center py-2 px-3 text-gray-600 dark:text-gray-400">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {taxes.map((tax) => (
                    <tr key={tax.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2 px-3 text-gray-900 dark:text-white font-medium">{tax.name}</td>
                      <td className="py-2 px-3 text-right text-gray-900 dark:text-white">
                        {formatPercent(Number(tax.rate))}
                      </td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-400">
                        {tax.description || '-'}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {tax.is_default && (
                          <Badge className="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                            Defecto
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <Badge className={tax.is_active 
                          ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                        }>
                          {tax.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cargos de Servicio */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-purple-600" />
            Cargos de Servicio
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Cargos adicionales aplicados a las ventas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {serviceCharges.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
              No hay cargos de servicio configurados
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {serviceCharges.map((charge) => (
                <div 
                  key={charge.id} 
                  className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{charge.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {charge.charge_type === 'percentage' 
                        ? formatPercent(Number(charge.charge_value))
                        : formatCurrency(Number(charge.charge_value))
                      }
                      {charge.is_optional && ' • Opcional'}
                      {charge.is_taxable && ' • Gravable'}
                    </p>
                  </div>
                  <Switch
                    checked={charge.is_active}
                    onCheckedChange={() => handleToggleServiceCharge(charge.id, charge.is_active)}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Impresoras */}
      <PrintersSection branches={branches} />

      {/* Estado del Print Agent y trabajos de impresión recientes (sucursal activa) */}
      <PrintAgentStatusCard branchId={branch_id} />
      <RecentPrintJobsTable branchId={branch_id} />

      {/* Modales de configuración avanzada */}
      <ConsecutivosModal open={showConsecutivos} onOpenChange={setShowConsecutivos} />
      <PropinasModal open={showPropinas} onOpenChange={setShowPropinas} />
      <CargosModal open={showCargos} onOpenChange={setShowCargos} />
      <ImpresionesModal open={showImpresiones} onOpenChange={setShowImpresiones} />
      <AgenteModal open={showAgente} onOpenChange={setShowAgente} />
    </div>
  );
}
