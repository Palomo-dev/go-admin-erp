'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShoppingCart,
  Receipt,
  CreditCard,
  RotateCcw,
  Wallet,
  BarChart3,
  Clock,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Plus,
  ChefHat,
  Package,
  RefreshCw,
  LockOpen,
  Lock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useOrganization, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { VentasService, DailySummary, CashSession } from './ventas';
import { formatCurrency } from '@/utils/Utils';
import { cn } from '@/utils/Utils';

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  color: string;
  badge?: string | number;
}

export function POSHome() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [cashSession, setCashSession] = useState<CashSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    if (organization?.id) {
      loadData();
    }

    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, [organization]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [summary, session] = await Promise.all([
        VentasService.getDailySummary(),
        VentasService.getCurrentCashSession()
      ]);
      setDailySummary(summary);
      setCashSession(session);
    } catch (error) {
      console.error('Error loading POS data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const quickActions: QuickAction[] = [
    {
      id: 'new-sale',
      label: 'Nueva Venta',
      description: 'Crear una venta rápida',
      icon: <Plus className="h-6 w-6" />,
      href: '/app/pos/ventas/nuevo',
      color: 'bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700'
    },
    {
      id: 'sales',
      label: 'Ventas',
      description: 'Ver historial de ventas',
      icon: <Receipt className="h-6 w-6" />,
      href: '/app/pos/ventas',
      color: 'bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700',
      badge: dailySummary?.total_sales || 0
    },
    {
      id: 'cash-register',
      label: 'Caja',
      description: 'Gestionar caja y arqueos',
      icon: <Wallet className="h-6 w-6" />,
      href: '/app/pos/cajas',
      color: 'bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700'
    },
    {
      id: 'returns',
      label: 'Devoluciones',
      description: 'Gestionar devoluciones',
      icon: <RotateCcw className="h-6 w-6" />,
      href: '/app/pos/devoluciones',
      color: 'bg-orange-500 hover:bg-orange-600 dark:bg-orange-600 dark:hover:bg-orange-700'
    },
    {
      id: 'kitchen',
      label: 'Cocina',
      description: 'Ver comandas pendientes',
      icon: <ChefHat className="h-6 w-6" />,
      href: '/app/pos/comandas',
      color: 'bg-purple-500 hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-700'
    },
    {
      id: 'reports',
      label: 'Reportes',
      description: 'Estadísticas del día',
      icon: <BarChart3 className="h-6 w-6" />,
      href: '/app/pos/reportes',
      color: 'bg-indigo-500 hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-700'
    }
  ];

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center space-y-4">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-blue-500" />
          <p className="text-gray-500 dark:text-gray-400">Cargando sistema POS...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header con estado de caja */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
            Sistema POS
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {organization?.name} • {currentTime.toLocaleDateString('es-ES', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
        </div>

        {/* Estado de caja */}
        <Card className={cn(
          "border-2",
          cashSession 
            ? "border-green-500 bg-green-50 dark:bg-green-900/20" 
            : "border-red-500 bg-red-50 dark:bg-red-900/20"
        )}>
          <CardContent className="p-4 flex items-center gap-4">
            {cashSession ? (
              <>
                <div className="p-2 rounded-full bg-green-500/20">
                  <LockOpen className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-semibold text-green-700 dark:text-green-300">Caja Abierta</p>
                  <p className="text-sm text-green-600 dark:text-green-400">
                    Desde {new Date(cashSession.opened_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <Link href="/app/pos/cajas">
                  <Button variant="outline" size="sm" className="border-green-500 text-green-700 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/40">
                    <Lock className="h-4 w-4 mr-1" />
                    Cerrar
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <div className="p-2 rounded-full bg-red-500/20">
                  <Lock className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="font-semibold text-red-700 dark:text-red-300">Caja Cerrada</p>
                  <p className="text-sm text-red-600 dark:text-red-400">
                    Abrir caja para vender
                  </p>
                </div>
                <Link href="/app/pos/cajas">
                  <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white">
                    <LockOpen className="h-4 w-4 mr-1" />
                    Abrir
                  </Button>
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Resumen del día */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Ventas Hoy</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {dailySummary?.total_sales || 0}
                </p>
              </div>
              <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
                <ShoppingCart className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Ventas</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(dailySummary?.total_amount || 0)}
                </p>
              </div>
              <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
                <DollarSign className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Pendientes</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {dailySummary?.pending_count || 0}
                </p>
              </div>
              <div className="p-3 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
                <Clock className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Completadas</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {dailySummary?.completed_count || 0}
                </p>
              </div>
              <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
                <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Acciones rápidas */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Acciones Rápidas
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {quickActions.map((action) => (
            <Link key={action.id} href={action.href}>
              <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400">
                <CardContent className="p-4 flex flex-col items-center text-center space-y-3">
                  <div className={cn("p-3 rounded-full text-white", action.color)}>
                    {action.icon}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 justify-center">
                      {action.label}
                      {action.badge !== undefined && Number(action.badge) > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {action.badge}
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {action.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Alerta si caja cerrada */}
      {!cashSession && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
          <CardContent className="p-4 flex items-center gap-4">
            <AlertCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-yellow-700 dark:text-yellow-300">
                La caja está cerrada
              </p>
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                Para realizar ventas, primero debe abrir la caja con el monto inicial.
              </p>
            </div>
            <Link href="/app/pos/cajas">
              <Button className="bg-yellow-500 hover:bg-yellow-600 text-white">
                Abrir Caja
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Botón flotante para nueva venta */}
      <Link href="/app/pos/ventas/nuevo" className="fixed bottom-6 right-6 z-50">
        <Button 
          size="lg" 
          className="rounded-full w-16 h-16 shadow-lg bg-blue-500 hover:bg-blue-600 text-white"
        >
          <Plus className="h-8 w-8" />
        </Button>
      </Link>
    </div>
  );
}
