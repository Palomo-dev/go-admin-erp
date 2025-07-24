'use client';

import { useState, useEffect } from 'react';
import { Wallet, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { formatCurrency } from '@/utils/Utils';

// Componentes del módulo de cajas
import { AperturaCajaDialog } from '@/components/pos/cajas/AperturaCajaDialog';
import { CierreCajaDialog } from '@/components/pos/cajas/CierreCajaDialog';
import { MovimientosDialog } from '@/components/pos/cajas/MovimientosDialog';
import { MovimientosList } from '@/components/pos/cajas/MovimientosList';
import { CashSummaryCard } from '@/components/pos/cajas/CashSummaryCard';
import { ReportGenerator } from '@/components/pos/cajas/ReportGenerator';
import { CajasService } from '@/components/pos/cajas/CajasService';
import type { CashSession } from '@/components/pos/cajas/types';
import { toast } from 'sonner';

export default function CajasPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const [activeSession, setActiveSession] = useState<CashSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Cargar sesión activa al inicio
  useEffect(() => {
    if (organization?.id) {
      loadActiveSession();
    }
  }, [organization]);

  const loadActiveSession = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const session = await CajasService.getActiveSession();
      setActiveSession(session);
      setLastUpdate(new Date());
    } catch (error: any) {
      console.error('Error loading active session:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSessionOpened = (session: CashSession) => {
    setActiveSession(session);
    setRefreshTrigger(prev => prev + 1);
    toast.success('Caja abierta exitosamente', {
      description: `Monto inicial: ${formatCurrency(session.initial_amount)}`
    });
  };

  const handleSessionClosed = (session: CashSession) => {
    setActiveSession(session);
    setRefreshTrigger(prev => prev + 1);
    toast.success('Caja cerrada exitosamente', {
      description: `Diferencia: ${formatCurrency(Math.abs(session.difference || 0))}`
    });
  };

  const handleMovementAdded = () => {
    setRefreshTrigger(prev => prev + 1);
    setLastUpdate(new Date());
  };

  const handleRefresh = () => {
    loadActiveSession();
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

  if (orgLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="container mx-auto max-w-7xl">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
            <span className="ml-3 text-lg dark:text-gray-300">Cargando datos de caja...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="container mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <Card className="dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-200">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <Wallet className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-2xl dark:text-white light:text-gray-900">
                    Apertura & Cierre de Caja
                  </CardTitle>
                  <p className="text-sm dark:text-gray-400 light:text-gray-600">
                    Gestión de sesiones de caja - {organization?.name || 'Organización'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 dark:text-gray-400 light:text-gray-500" />
                    <span className="text-sm dark:text-gray-400 light:text-gray-600">
                      {formatDateTime(lastUpdate)}
                    </span>
                  </div>
                  <Badge 
                    variant="outline"
                    className={`mt-1 ${
                      activeSession?.status === 'open'
                        ? 'border-green-500 text-green-600 dark:border-green-400 dark:text-green-400'
                        : 'border-gray-500 text-gray-600 dark:border-gray-400 dark:text-gray-400'
                    }`}
                  >
                    {activeSession?.status === 'open' ? '🟢 Caja Abierta' : '🔴 Caja Cerrada'}
                  </Badge>
                </div>
                
                <Button
                  onClick={handleRefresh}
                  size="sm"
                  variant="outline"
                  className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Error Alert */}
        {error && (
          <Alert className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            <AlertDescription className="text-red-800 dark:text-red-200">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Estado: No hay sesión activa */}
        {!activeSession && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card className="dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-200">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2 dark:text-white light:text-gray-900">
                    <Wallet className="h-5 w-5 text-blue-600" />
                    <span>No hay sesión de caja activa</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="text-center py-8">
                    <div className="mx-auto w-24 h-24 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
                      <Wallet className="h-12 w-12 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium dark:text-white light:text-gray-900 mb-2">
                      Caja Cerrada
                    </h3>
                    <p className="dark:text-gray-400 light:text-gray-600 mb-6">
                      Para comenzar a operar, debes abrir una nueva sesión de caja
                      declarando el monto inicial de efectivo.
                    </p>
                    
                    <AperturaCajaDialog onSessionOpened={handleSessionOpened} />
                  </div>

                  <Separator className="dark:bg-gray-700 light:bg-gray-200" />

                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                      ℹ️ ¿Qué incluye la apertura de caja?
                    </h4>
                    <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                      <li>Declaración del monto inicial de efectivo</li>
                      <li>Registro automático de fecha y hora de apertura</li>
                      <li>Habilitación para registrar ventas y movimientos</li>
                      <li>Control de ingresos y egresos durante el turno</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <div>
              <Card className="dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-200">
                <CardHeader>
                  <CardTitle className="text-lg dark:text-white light:text-gray-900">
                    Acciones Rápidas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm dark:text-gray-400 light:text-gray-600">
                    Funciones disponibles una vez abierta la caja:
                  </p>
                  
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2 text-sm">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="dark:text-gray-300 light:text-gray-700">Registrar ingresos/egresos</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span className="dark:text-gray-300 light:text-gray-700">Realizar arqueo de caja</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm">
                      <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                      <span className="dark:text-gray-300 light:text-gray-700">Generar reportes PDF</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm">
                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                      <span className="dark:text-gray-300 light:text-gray-700">Cerrar sesión de caja</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Estado: Sesión de caja activa */}
        {activeSession && (
          <>
            {/* Controles principales */}
            <Card className="dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-200">
              <CardContent className="pt-6">
                <div className="flex flex-wrap gap-4 justify-center sm:justify-start">
                  <MovimientosDialog 
                    onMovementAdded={handleMovementAdded}
                    disabled={activeSession.status === 'closed'}
                  />
                  
                  {activeSession.status === 'open' && (
                    <CierreCajaDialog 
                      session={activeSession} 
                      onSessionClosed={handleSessionClosed} 
                    />
                  )}
                  
                  <ReportGenerator 
                    sessionId={activeSession.id}
                    disabled={false}
                  />
                  
                  {activeSession.status === 'closed' && (
                    <AperturaCajaDialog onSessionOpened={handleSessionOpened} />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Contenido principal - Layout responsivo */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Columna izquierda: Resumen y reportes */}
              <div className="lg:col-span-2 space-y-6">
                <CashSummaryCard 
                  session={activeSession} 
                  refreshTrigger={refreshTrigger} 
                />
                
                <ReportGenerator 
                  sessionId={activeSession.id}
                  disabled={false}
                />
              </div>

              {/* Columna derecha: Movimientos */}
              <div className="lg:col-span-1">
                <MovimientosList 
                  sessionId={activeSession.id} 
                  refreshTrigger={refreshTrigger} 
                />
              </div>
            </div>
          </>
        )}

        {/* Footer informativo */}
        <Card className="dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-200">
          <CardContent className="pt-4">
            <div className="flex flex-col sm:flex-row justify-between items-center text-sm dark:text-gray-400 light:text-gray-600">
              <p>
                © 2025 GO Admin ERP - Sistema de gestión de cajas POS
              </p>
              <p>
                Última actualización: {formatDateTime(lastUpdate)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}