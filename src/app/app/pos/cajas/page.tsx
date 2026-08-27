'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Wallet, Clock, AlertCircle, RefreshCw, History, Eye, UserCircle, Store, Users, Globe, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { formatCurrency, cn } from '@/utils/Utils';

// Componentes del módulo de cajas
import { AperturaCajaDialog } from '@/components/pos/cajas/AperturaCajaDialog';
import { CierreCajaDialog } from '@/components/pos/cajas/CierreCajaDialog';
import { MovimientosDialog } from '@/components/pos/cajas/MovimientosDialog';
import { MovimientosList } from '@/components/pos/cajas/MovimientosList';
import { CashSummaryCard } from '@/components/pos/cajas/CashSummaryCard';
import { ReportGenerator } from '@/components/pos/cajas/ReportGenerator';
import { SessionsPagination } from '@/components/pos/cajas/SessionsPagination';
import { CajasService } from '@/components/pos/cajas/CajasService';
import { useBlindCloseMode } from '@/components/pos/cajas/useBlindCloseMode';
import type { CashSession } from '@/components/pos/cajas/types';
import { toast } from 'sonner';
import { StatsSkeleton, CardListSkeleton, PageHeaderSkeleton, TableSkeleton } from '@/components/common/PageSkeletons';
import { supabase } from '@/lib/supabase/config';

export default function CajasPage() {
  const { showExpected } = useBlindCloseMode();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { branchFilter, isLoading: branchLoading } = useBranch();
  const [activeSession, setActiveSession] = useState<CashSession | null>(null);
  const [activeSessions, setActiveSessions] = useState<CashSession[]>([]);
  const [openSessionsCount, setOpenSessionsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isFirstLoadRef = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Paginación del historial
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyData, setHistoryData] = useState<CashSession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);

  // Cargar userId y rol del usuario actual
  useEffect(() => {
    const loadUserInfo = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setCurrentUserId(user.id);
          // Verificar si es admin de la organización
          const { data: memberData } = await supabase
            .from('organization_members')
            .select('is_super_admin, role_id, roles(name)')
            .eq('user_id', user.id)
            .eq('organization_id', organization?.id || 0)
            .eq('is_active', true)
            .single();
          if (memberData) {
            const roleName = (memberData.roles as any)?.name?.toLowerCase() || ''
            const isAdmin = memberData.is_super_admin ||
              roleName.includes('admin') ||
              roleName.includes('owner') ||
              memberData.role_id === 2; // Admin de organización
            setIsOrgAdmin(isAdmin);
          }
        }
      } catch (err) {
        console.warn('Error loading user info:', err);
      }
    };
    if (organization?.id) {
      loadUserInfo();
    }
  }, [organization]);

  // Cargar sesión activa, sesiones activas e historial al inicio y al cambiar de sucursal
  useEffect(() => {
    if (organization?.id && !branchLoading) {
      loadActiveSession();
      loadActiveSessions();
      loadOpenSessionsCount();
      loadHistory();
    }
  }, [organization, branchFilter, branchLoading]);

  // Suscripción realtime a cash_sessions y cash_movements.
  // Recarga silenciosamente (sin spinner) cuando hay cambios en otra pestaña/terminal,
  // igual que /comandas y /pedidos-online. Debounce de 300ms para agrupar ráfagas.
  useEffect(() => {
    if (!organization?.id) return;

    const debounceRef = { current: null as ReturnType<typeof setTimeout> | null };
    const triggerReload = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        // Recarga silenciosa: no mostramos el skeleton ni el overlay de refreshing
        loadActiveSession(true);
        loadActiveSessions();
        loadOpenSessionsCount();
        loadHistory();
      }, 300);
    };

    const unsubscribe = CajasService.subscribeToCashSessions(
      organization.id,
      triggerReload,
      { includeMovements: true }
    );

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id, branchFilter]);

  const loadActiveSession = async (silent: boolean = false) => {
    if (isFirstLoadRef.current) {
      setIsLoading(true);
    }
    if (!silent) {
      setIsRefreshing(true);
    }
    setError(null);
    try {
      const session = await CajasService.getActiveSession();
      setActiveSession(session);
      setLastUpdate(new Date());
    } catch (error: any) {
      console.error('Error loading active session:', error);
      setError(error.message);
    } finally {
      isFirstLoadRef.current = false;
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const loadActiveSessions = async () => {
    try {
      const sessions = await CajasService.getActiveSessions();
      setActiveSessions(sessions);
    } catch (error) {
      console.error('Error loading active sessions:', error);
    }
  };

  const loadOpenSessionsCount = async () => {
    try {
      const count = await CajasService.getOpenSessionsCount();
      setOpenSessionsCount(count);
    } catch (error) {
      console.error('Error loading open sessions count:', error);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const result = await CajasService.getSessionHistoryPaginated(historyPage, historyPageSize, { status: 'all' });
      setHistoryData(result.data);
      setHistoryTotal(result.total);
    } catch (error) {
      console.error('Error loading session history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Recargar historial cuando cambia la página
  useEffect(() => {
    if (organization?.id) {
      loadHistory();
    }
  }, [historyPage, historyPageSize]);

  const handleSessionOpened = (session: CashSession) => {
    loadActiveSessions();
    loadOpenSessionsCount();
    loadHistory();
    setActiveSession(session);
    setRefreshTrigger(prev => prev + 1);
    toast.success('Caja abierta exitosamente', {
      description: `Monto inicial: ${formatCurrency(session.initial_amount)}`
    });
  };

  const handleSessionClosed = (session: CashSession) => {
    loadActiveSessions();
    loadOpenSessionsCount();
    loadHistory();
    // Recargar la sesión activa desde Supabase en lugar de asumir null,
    // ya que podría existir otra caja abierta (global o de otra sucursal).
    loadActiveSession();
    setRefreshTrigger(prev => prev + 1);
    toast.success('Caja cerrada exitosamente', {
      description: showExpected ? `Diferencia: ${formatCurrency(Math.abs(session.difference || 0))}` : 'Caja cerrada'
    });
  };

  const handleMovementAdded = () => {
    setRefreshTrigger(prev => prev + 1);
    setLastUpdate(new Date());
  };

  const handleRefresh = () => {
    loadActiveSession();
    loadActiveSessions();
    setRefreshTrigger(prev => prev + 1);
  };

  const formatDateTime = (date: Date) => {
    return date.toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const historyTotalPages = Math.ceil(historyTotal / historyPageSize);

  if (orgLoading || branchLoading || (isLoading && !activeSession && activeSessions.length === 0)) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <StatsSkeleton count={4} />
        <CardListSkeleton cards={4} columns="1" />
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen bg-gray-50 dark:bg-gray-900 p-4 space-y-4", isRefreshing && "opacity-60 pointer-events-none")}>
      {/* Header compacto */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
            <Wallet className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold dark:text-white text-gray-900">Cajas POS</h2>
            <p className="text-sm dark:text-gray-400 text-gray-600">
              {organization?.name || 'Organización'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 dark:text-gray-400 text-gray-500" />
              <span className="text-sm dark:text-gray-400 text-gray-600">
                {formatDateTime(lastUpdate)}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <Badge
                variant="outline"
                className={
                  activeSession?.status === 'open'
                    ? 'border-green-500 text-green-600 dark:border-green-400 dark:text-green-400'
                    : 'border-gray-500 text-gray-600 dark:border-gray-400 dark:text-gray-400'
                }
              >
                {activeSession?.status === 'open' ? '🟢 Mi Caja Abierta' : '🔴 Sin Caja'}
              </Badge>
              {openSessionsCount > 0 && (
                <span className="flex items-center gap-1 text-xs dark:text-gray-400 text-gray-600">
                  <Store className="h-3.5 w-3.5" />
                  {openSessionsCount} abierta{openSessionsCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          <Button onClick={handleRefresh} size="sm" variant="outline" disabled={isRefreshing}>
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Alert className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
          <AlertDescription className="text-red-800 dark:text-red-200">{error}</AlertDescription>
        </Alert>
      )}

      {/* Tabs principales */}
      <Tabs defaultValue="mi-caja">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-flex">
          <TabsTrigger value="mi-caja" className="gap-2">
            <Wallet className="h-4 w-4" />
            Mi Caja
          </TabsTrigger>
          <TabsTrigger value="cajas-abiertas" className="gap-2">
            <Users className="h-4 w-4" />
            Cajas Abiertas
            {activeSessions.length > 0 && (
              <Badge className="ml-1 bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-xs px-1.5 py-0">
                {activeSessions.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="historial" className="gap-2">
            <History className="h-4 w-4" />
            Historial
          </TabsTrigger>
        </TabsList>

        {/* Tab: Mi Caja */}
        <TabsContent value="mi-caja" className="space-y-4">
          {!activeSession && (
            <Card className="dark:bg-gray-800 dark:border-gray-700 bg-white border-gray-200">
              <CardContent className="pt-6">
                <div className="text-center py-6">
                  <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-3">
                    <Wallet className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium dark:text-white text-gray-900 mb-1">
                    No tienes caja abierta
                  </h3>
                  <p className="text-sm dark:text-gray-400 text-gray-600 mb-4">
                    Abre una caja para comenzar a registrar ventas y movimientos.
                  </p>
                  <AperturaCajaDialog onSessionOpened={handleSessionOpened} />
                </div>
              </CardContent>
            </Card>
          )}

          {activeSession && (
            <>
              {/* Controles */}
              <div className="flex flex-wrap gap-3">
                <MovimientosDialog
                  onMovementAdded={handleMovementAdded}
                  disabled={activeSession.status === 'closed'}
                />
                {activeSession.status === 'open' && (
                  (() => {
                    const canClose = isOrgAdmin || activeSession.opened_by === currentUserId;
                    if (!canClose) {
                      return (
                        <div className="flex flex-col gap-2">
                          <Button
                            disabled
                            className="bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
                            title="Solo el cajero que abrió la caja o un administrador puede cerrarla"
                          >
                            <Lock className="h-5 w-5 mr-2" />
                            Cerrar Caja
                          </Button>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Solo {activeSession.opened_by_name || 'el cajero'} o un administrador pueden cerrar esta caja.
                          </p>
                        </div>
                      );
                    }
                    return (
                      <CierreCajaDialog
                        session={activeSession}
                        onSessionClosed={handleSessionClosed}
                      />
                    );
                  })()
                )}
                {activeSession.status === 'closed' && (
                  <AperturaCajaDialog onSessionOpened={handleSessionOpened} />
                )}
              </div>

              {/* Resumen y movimientos */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-4">
                  <CashSummaryCard session={activeSession} refreshTrigger={refreshTrigger} />
                  <ReportGenerator sessionId={activeSession.id} disabled={false} />
                </div>
                <div className="lg:col-span-1">
                  <MovimientosList sessionId={activeSession.id} refreshTrigger={refreshTrigger} />
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* Tab: Cajas Abiertas */}
        <TabsContent value="cajas-abiertas" className="space-y-4">
          {activeSessions.length === 0 ? (
            <Card className="dark:bg-gray-800 dark:border-gray-700 bg-white border-gray-200">
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <Users className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                  <p className="dark:text-gray-400 text-gray-600">
                    No hay cajas abiertas en esta sucursal
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeSessions.map((session) => (
                <Card key={session.id} className="dark:bg-gray-800 dark:border-gray-700 bg-white border-gray-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <UserCircle className="h-5 w-5 text-blue-600" />
                        {(session as any).opened_by_name || 'Cajero'}
                      </CardTitle>
                      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                        Abierta
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="dark:text-gray-400 text-gray-600">Caja #</span>
                      <span className="font-mono font-medium dark:text-white">{session.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="dark:text-gray-400 text-gray-600">Sucursal</span>
                      <span className="dark:text-white text-right break-words whitespace-normal min-w-0 flex-1 ml-2">{(session as any).branch_name || `#${session.branch_id}`}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="dark:text-gray-400 text-gray-600">Apertura</span>
                      <span className="dark:text-white">{formatDateTime(new Date(session.opened_at))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="dark:text-gray-400 text-gray-600">Monto inicial</span>
                      <span className="font-medium dark:text-white">{formatCurrency(session.initial_amount)}</span>
                    </div>
                    <Separator className="dark:bg-gray-700 bg-gray-200" />
                    <Button variant="outline" size="sm" className="w-full" asChild>
                      <Link href={`/app/pos/cajas/${session.uuid}`}>
                        <Eye className="h-4 w-4 mr-1" />
                        Ver detalle
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab: Historial */}
        <TabsContent value="historial" className="space-y-4">
          <Card className="dark:bg-gray-800 dark:border-gray-700 bg-white border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base dark:text-white">
                <History className="h-5 w-5" />
                Historial de Sesiones
              </CardTitle>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <TableSkeleton rows={5} columns={8} />
              ) : historyData.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No hay sesiones registradas
                </p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Sucursal</TableHead>
                        <TableHead>Cajero</TableHead>
                        <TableHead>Apertura</TableHead>
                        <TableHead>Cierre</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Inicial</TableHead>
                        {showExpected && <TableHead className="text-right">Final</TableHead>}
                        {showExpected && <TableHead className="text-right">Diferencia</TableHead>}
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyData.map((session) => (
                        <TableRow key={session.id}>
                          <TableCell className="font-mono text-sm">#{session.id}</TableCell>
                          <TableCell className="text-sm">{(session as any).branch_name || `#${session.branch_id}`}</TableCell>
                          <TableCell className="text-sm">
                            <span className="flex items-center gap-1.5">
                              <UserCircle className="h-3.5 w-3.5 text-gray-400" />
                              {(session as any).opened_by_name || '-'}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">{formatDateTime(new Date(session.opened_at))}</TableCell>
                          <TableCell className="text-sm">
                            {session.closed_at ? formatDateTime(new Date(session.closed_at)) : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge className={cn(
                              session.status === 'open'
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                            )}>
                              {session.status === 'open' ? 'Abierta' : 'Cerrada'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(session.initial_amount)}</TableCell>
                          {showExpected && (
                            <TableCell className="text-right">
                              {session.final_amount ? formatCurrency(session.final_amount) : '-'}
                            </TableCell>
                          )}
                          {showExpected && (
                            <TableCell className={cn(
                              'text-right font-medium',
                              (session.difference || 0) >= 0
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-red-600 dark:text-red-400'
                            )}>
                              {session.difference !== null && session.difference !== undefined
                                ? formatCurrency(session.difference)
                                : '-'}
                            </TableCell>
                          )}
                          <TableCell>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/app/pos/cajas/${session.uuid}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <Separator className="my-4 dark:bg-gray-700 bg-gray-200" />

                  <SessionsPagination
                    currentPage={historyPage}
                    totalPages={historyTotalPages}
                    pageSize={historyPageSize}
                    totalItems={historyTotal}
                    onPageChange={setHistoryPage}
                    onPageSizeChange={(size) => {
                      setHistoryPageSize(size);
                      setHistoryPage(1);
                    }}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
