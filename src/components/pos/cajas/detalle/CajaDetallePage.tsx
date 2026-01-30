'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Wallet,
  Clock,
  RefreshCw,
  Plus,
  FileText,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle,
  XCircle,
  Receipt,
  Calculator,
  Download,
  Printer
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { formatCurrency, formatDate, cn } from '@/utils/Utils';
import { CajasService } from '../CajasService';
import { CierreCajaDialog } from '../CierreCajaDialog';
import type { CashSession, CashMovement, CashCount, CashSummary } from '../types';
import { toast } from 'sonner';

interface CajaDetallePageProps {
  sessionUuid: string;
}

export function CajaDetallePage({ sessionUuid }: CajaDetallePageProps) {
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const [session, setSession] = useState<CashSession | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [counts, setCounts] = useState<CashCount[]>([]);
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [paymentsByMethod, setPaymentsByMethod] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('resumen');
  const [showCierreDialog, setShowCierreDialog] = useState(false);

  useEffect(() => {
    if (organization?.id && sessionUuid) {
      loadSessionData();
    }
  }, [organization, sessionUuid]);

  const loadSessionData = async () => {
    setIsLoading(true);
    try {
      const [detail, salesData, paymentsData] = await Promise.all([
        CajasService.getSessionDetailByUuid(sessionUuid),
        CajasService.getSessionSalesByUuid(sessionUuid),
        CajasService.getSessionPaymentsByMethodByUuid(sessionUuid)
      ]);
      
      setSession(detail.session);
      setMovements(detail.movements);
      setCounts(detail.counts);
      setSummary(detail.summary);
      setSales(salesData);
      setPaymentsByMethod(paymentsData);
    } catch (error: any) {
      console.error('Error loading session data:', error);
      toast.error('Error al cargar datos de la sesión');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSessionClosed = (closedSession: CashSession) => {
    setSession(closedSession);
    setShowCierreDialog(false);
    loadSessionData();
    toast.success('Caja cerrada exitosamente');
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCountTypeLabel = (type: string) => {
    switch (type) {
      case 'opening': return 'Apertura';
      case 'partial': return 'Parcial';
      case 'closing': return 'Cierre';
      default: return type;
    }
  };

  const getCountTypeBadge = (type: string) => {
    switch (type) {
      case 'opening':
        return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Apertura</Badge>;
      case 'partial':
        return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Parcial</Badge>;
      case 'closing':
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Cierre</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  if (orgLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="container mx-auto max-w-7xl">
          <div className="flex justify-center items-center h-64">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-3 text-lg dark:text-gray-300">Cargando sesión de caja...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="container mx-auto max-w-7xl">
          <Card className="dark:bg-gray-800">
            <CardContent className="p-6 text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
              <h2 className="text-lg font-semibold mb-2 dark:text-white">Sesión no encontrada</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-4">La sesión de caja solicitada no existe.</p>
              <Link href="/app/pos/cajas">
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Volver a Cajas
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="container mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/app/pos/cajas">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold dark:text-white">Sesión #{session.id}</h1>
                <Badge className={cn(
                  session.status === 'open'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                )}>
                  {session.status === 'open' ? 'Abierta' : 'Cerrada'}
                </Badge>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Abierta: {formatDateTime(session.opened_at)}
                {session.closed_at && ` | Cerrada: ${formatDateTime(session.closed_at)}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadSessionData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Actualizar
            </Button>
            {session.status === 'open' && (
              <>
                <Link href={`/app/pos/cajas/${sessionUuid}/arqueos/nuevo`}>
                  <Button variant="outline" size="sm">
                    <Calculator className="h-4 w-4 mr-2" />
                    Arqueo
                  </Button>
                </Link>
                <Link href={`/app/pos/cajas/${sessionUuid}/movimientos/nuevo`}>
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Movimiento
                  </Button>
                </Link>
                <Button size="sm" onClick={() => setShowCierreDialog(true)}>
                  <XCircle className="h-4 w-4 mr-2" />
                  Cerrar Caja
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Resumen Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Monto Inicial</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {formatCurrency(summary?.initial_amount || 0)}
                  </p>
                </div>
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                  <Wallet className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Ventas Efectivo</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(summary?.sales_cash || 0)}
                  </p>
                </div>
                <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
                  <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Monto Esperado</p>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {formatCurrency(summary?.expected_amount || 0)}
                  </p>
                </div>
                <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                  <Calculator className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Diferencia</p>
                  <p className={cn(
                    "text-2xl font-bold",
                    (summary?.difference || 0) >= 0 
                      ? "text-green-600 dark:text-green-400" 
                      : "text-red-600 dark:text-red-400"
                  )}>
                    {formatCurrency(summary?.difference || 0)}
                  </p>
                </div>
                <div className={cn(
                  "p-3 rounded-full",
                  (summary?.difference || 0) >= 0 
                    ? "bg-green-100 dark:bg-green-900/30" 
                    : "bg-red-100 dark:bg-red-900/30"
                )}>
                  {(summary?.difference || 0) >= 0 
                    ? <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                    : <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                  }
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="resumen">Resumen</TabsTrigger>
            <TabsTrigger value="movimientos">Movimientos ({movements.length})</TabsTrigger>
            <TabsTrigger value="arqueos">Arqueos ({counts.length})</TabsTrigger>
            <TabsTrigger value="ventas">Ventas ({sales.length})</TabsTrigger>
          </TabsList>

          {/* Tab Resumen */}
          <TabsContent value="resumen" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Desglose de Caja */}
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <CardTitle className="text-lg dark:text-white">Desglose de Caja</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between py-2 border-b dark:border-gray-700">
                    <span className="text-gray-600 dark:text-gray-400">Monto Inicial</span>
                    <span className="font-medium dark:text-white">{formatCurrency(summary?.initial_amount || 0)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b dark:border-gray-700">
                    <span className="text-gray-600 dark:text-gray-400">+ Ventas en Efectivo</span>
                    <span className="font-medium text-green-600 dark:text-green-400">+{formatCurrency(summary?.sales_cash || 0)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b dark:border-gray-700">
                    <span className="text-gray-600 dark:text-gray-400">+ Ingresos</span>
                    <span className="font-medium text-green-600 dark:text-green-400">+{formatCurrency(summary?.cash_in || 0)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b dark:border-gray-700">
                    <span className="text-gray-600 dark:text-gray-400">- Egresos</span>
                    <span className="font-medium text-red-600 dark:text-red-400">-{formatCurrency(summary?.cash_out || 0)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between py-2">
                    <span className="font-semibold dark:text-white">= Monto Esperado</span>
                    <span className="font-bold text-lg text-blue-600 dark:text-blue-400">{formatCurrency(summary?.expected_amount || 0)}</span>
                  </div>
                  {session.status === 'closed' && summary?.counted_amount !== undefined && (
                    <>
                      <div className="flex justify-between py-2 border-t dark:border-gray-700">
                        <span className="text-gray-600 dark:text-gray-400">Monto Contado</span>
                        <span className="font-medium dark:text-white">{formatCurrency(summary.counted_amount)}</span>
                      </div>
                      <div className="flex justify-between py-2">
                        <span className="font-semibold dark:text-white">Diferencia</span>
                        <span className={cn(
                          "font-bold",
                          (summary.difference || 0) >= 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {formatCurrency(summary.difference || 0)}
                        </span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Pagos por Método */}
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <CardTitle className="text-lg dark:text-white">Pagos por Método</CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.keys(paymentsByMethod).length === 0 ? (
                    <p className="text-center text-gray-500 dark:text-gray-400 py-4">No hay pagos registrados</p>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(paymentsByMethod).map(([method, amount]) => (
                        <div key={method} className="flex justify-between items-center py-2 border-b dark:border-gray-700 last:border-0">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "p-2 rounded-full",
                              method === 'cash' ? "bg-green-100 dark:bg-green-900/30" :
                              method === 'card' ? "bg-blue-100 dark:bg-blue-900/30" :
                              "bg-gray-100 dark:bg-gray-700"
                            )}>
                              <DollarSign className={cn(
                                "h-4 w-4",
                                method === 'cash' ? "text-green-600 dark:text-green-400" :
                                method === 'card' ? "text-blue-600 dark:text-blue-400" :
                                "text-gray-600 dark:text-gray-400"
                              )} />
                            </div>
                            <span className="capitalize dark:text-white">
                              {method === 'cash' ? 'Efectivo' : method === 'card' ? 'Tarjeta' : method}
                            </span>
                          </div>
                          <span className="font-semibold dark:text-white">{formatCurrency(amount)}</span>
                        </div>
                      ))}
                      <Separator />
                      <div className="flex justify-between py-2">
                        <span className="font-semibold dark:text-white">Total</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400">
                          {formatCurrency(Object.values(paymentsByMethod).reduce((a, b) => a + b, 0))}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab Movimientos */}
          <TabsContent value="movimientos">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg dark:text-white">Movimientos de Caja</CardTitle>
                {session.status === 'open' && (
                  <Link href={`/app/pos/cajas/${sessionUuid}/movimientos/nuevo`}>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Nuevo Movimiento
                    </Button>
                  </Link>
                )}
              </CardHeader>
              <CardContent>
                {movements.length === 0 ? (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">No hay movimientos registrados</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Concepto</TableHead>
                        <TableHead>Notas</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.map((mov) => (
                        <TableRow key={mov.id}>
                          <TableCell className="text-sm">{formatDateTime(mov.created_at)}</TableCell>
                          <TableCell>
                            <Badge className={cn(
                              mov.type === 'in' 
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            )}>
                              {mov.type === 'in' ? 'Ingreso' : 'Egreso'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium dark:text-white">{mov.concept}</TableCell>
                          <TableCell className="text-gray-500 dark:text-gray-400">{mov.notes || '-'}</TableCell>
                          <TableCell className={cn(
                            "text-right font-semibold",
                            mov.type === 'in' ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                          )}>
                            {mov.type === 'in' ? '+' : '-'}{formatCurrency(mov.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab Arqueos */}
          <TabsContent value="arqueos">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg dark:text-white">Arqueos de Caja</CardTitle>
                {session.status === 'open' && (
                  <Link href={`/app/pos/cajas/${sessionUuid}/arqueos/nuevo`}>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Nuevo Arqueo
                    </Button>
                  </Link>
                )}
              </CardHeader>
              <CardContent>
                {counts.length === 0 ? (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">No hay arqueos registrados</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Contado</TableHead>
                        <TableHead className="text-right">Esperado</TableHead>
                        <TableHead className="text-right">Diferencia</TableHead>
                        <TableHead>Notas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {counts.map((count) => (
                        <TableRow key={count.id}>
                          <TableCell className="text-sm">{formatDateTime(count.created_at)}</TableCell>
                          <TableCell>{getCountTypeBadge(count.count_type)}</TableCell>
                          <TableCell className="text-right font-medium dark:text-white">
                            {formatCurrency(count.counted_amount)}
                          </TableCell>
                          <TableCell className="text-right text-gray-500 dark:text-gray-400">
                            {formatCurrency(count.expected_amount || 0)}
                          </TableCell>
                          <TableCell className={cn(
                            "text-right font-semibold",
                            (count.difference || 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                          )}>
                            {formatCurrency(count.difference || 0)}
                          </TableCell>
                          <TableCell className="text-gray-500 dark:text-gray-400">{count.notes || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab Ventas */}
          <TabsContent value="ventas">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg dark:text-white">Ventas del Turno</CardTitle>
              </CardHeader>
              <CardContent>
                {sales.length === 0 ? (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">No hay ventas en este turno</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>ID</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Pago</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sales.map((sale) => (
                        <TableRow key={sale.id}>
                          <TableCell className="text-sm">{formatDateTime(sale.created_at)}</TableCell>
                          <TableCell className="font-mono text-xs">{sale.id.slice(0, 8)}...</TableCell>
                          <TableCell>
                            <Badge variant={sale.status === 'completed' ? 'default' : 'secondary'}>
                              {sale.status === 'completed' ? 'Completada' : sale.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn(
                              sale.payment_status === 'paid' 
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                            )}>
                              {sale.payment_status === 'paid' ? 'Pagado' : sale.payment_status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold dark:text-white">
                            {formatCurrency(sale.total)}
                          </TableCell>
                          <TableCell>
                            <Link href={`/app/pos/ventas/${sale.id}`}>
                              <Button variant="ghost" size="sm">
                                <Receipt className="h-4 w-4" />
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        {session.status === 'open' && (
          <CierreCajaDialog
            session={session}
            open={showCierreDialog}
            onOpenChange={setShowCierreDialog}
            onSessionClosed={handleSessionClosed}
          />
        )}
      </div>
    </div>
  );
}
