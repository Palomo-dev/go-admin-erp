'use client';

import { useState, useEffect } from 'react';
import { Calculator, Lock, CreditCard, Banknote, Wallet, Smartphone, ArrowUpCircle, ArrowDownCircle, ShoppingCart, UtensilsCrossed, FileText, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/utils/Utils';
import { CajasService } from './CajasService';
import type { CashSession, CashSummary, CloseCashSessionData, SessionPaymentDetail } from './types';
import { toast } from 'sonner';

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  credit: 'Credito',
  mixed: 'Mixto',
  other: 'Otros',
};

const METHOD_ICONS: Record<string, React.ReactNode> = {
  cash: <Banknote className="h-3.5 w-3.5" />,
  card: <CreditCard className="h-3.5 w-3.5" />,
  transfer: <Smartphone className="h-3.5 w-3.5" />,
  credit: <Wallet className="h-3.5 w-3.5" />,
};

const MOVEMENT_ICONS: Record<string, React.ReactNode> = {
  venta_pos: <ShoppingCart className="h-3.5 w-3.5" />,
  venta_mesa: <UtensilsCrossed className="h-3.5 w-3.5" />,
  venta_factura: <FileText className="h-3.5 w-3.5" />,
  compra_factura: <Receipt className="h-3.5 w-3.5" />,
  cuenta_por_cobrar: <FileText className="h-3.5 w-3.5" />,
  cuenta_por_pagar: <Receipt className="h-3.5 w-3.5" />,
  otro: <Wallet className="h-3.5 w-3.5" />,
};

interface CierreCajaDialogProps {
  session: CashSession;
  onSessionClosed: (session: CashSession) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CierreCajaDialog({ session, onSessionClosed, open: controlledOpen, onOpenChange }: CierreCajaDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  
  // Usar estado controlado si se proporciona, sino usar estado interno
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  const [loading, setLoading] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [movements, setMovements] = useState<SessionPaymentDetail[]>([]);
  const [formData, setFormData] = useState<CloseCashSessionData>({
    final_amount: 0,
    notes: ''
  });

  // Cargar resumen cuando se abre el modal
  useEffect(() => {
    if (open) {
      loadCashSummary();
    }
  }, [open]);

  const loadCashSummary = async () => {
    setLoadingSummary(true);
    try {
      const [cashSummary, sessionMovements] = await Promise.all([
        CajasService.getCashSummary(session.id),
        CajasService.getSessionPaymentsDetail(session.id),
      ]);
      setSummary(cashSummary);
      setMovements(sessionMovements);
      // Pre-llenar con el monto esperado
      setFormData(prev => ({
        ...prev,
        final_amount: cashSummary.expected_amount
      }));
    } catch (error) {
      console.error('Error loading cash summary:', error);
      toast.error('Error al cargar resumen de caja');
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleInputChange = (field: keyof CloseCashSessionData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const getDifference = (): number => {
    if (!summary) return 0;
    return formData.final_amount - summary.expected_amount;
  };

  const getDifferenceColor = (): string => {
    const diff = getDifference();
    if (diff === 0) return 'text-gray-600 dark:text-gray-400';
    return diff > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.final_amount < 0) {
      toast.error('El monto final no puede ser negativo');
      return;
    }

    setLoading(true);
    try {
      const closedSession = await CajasService.closeSession(formData);
      toast.success('Caja cerrada exitosamente', {
        description: `Diferencia: ${formatCurrency(Math.abs(getDifference()))}`
      });
      
      onSessionClosed(closedSession);
      setOpen(false);
    } catch (error: any) {
      console.error('Error closing cash session:', error);
      toast.error('Error al cerrar caja', {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          size="lg"
          className="bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
        >
          <Lock className="h-5 w-5 mr-2" />
          Cerrar Caja
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-gray-800 bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 dark:text-white text-gray-900">
            <Calculator className="h-5 w-5 text-red-600" />
            <span>Arqueo y Cierre de Caja</span>
          </DialogTitle>
        </DialogHeader>

        {loadingSummary ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
            <span className="ml-2 dark:text-gray-300">Calculando resumen...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Resumen de movimientos */}
            <Card className="dark:bg-gray-700 dark:border-gray-600 bg-gray-50 border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm dark:text-gray-200 text-gray-700">
                  Resumen de Movimientos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="dark:text-gray-400 text-gray-600">Monto inicial:</span>
                    <p className="font-medium dark:text-white text-gray-900">
                      {summary ? formatCurrency(summary.initial_amount) : '-'}
                    </p>
                  </div>
                  <div>
                    <span className="dark:text-gray-400 text-gray-600">Ventas en efectivo:</span>
                    <p className="font-medium text-green-600">
                      {summary ? formatCurrency(summary.sales_cash) : '-'}
                    </p>
                  </div>
                  <div>
                    <span className="dark:text-gray-400 text-gray-600">Ingresos:</span>
                    <p className="font-medium text-blue-600">
                      {summary ? formatCurrency(summary.cash_in) : '-'}
                    </p>
                  </div>
                  <div>
                    <span className="dark:text-gray-400 text-gray-600">Egresos:</span>
                    <p className="font-medium text-red-600">
                      {summary ? formatCurrency(summary.cash_out) : '-'}
                    </p>
                  </div>
                </div>
                
                <Separator className="dark:bg-gray-600 bg-gray-300" />

                {/* Desglose por metodo de pago: ingresos */}
                {summary?.income_by_method && Object.keys(summary.income_by_method).length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-medium flex items-center gap-1 dark:text-green-400 text-green-700">
                      <ArrowUpCircle className="h-3.5 w-3.5" /> Ingresos por metodo de pago:
                    </span>
                    <div className="space-y-1.5">
                      {Object.entries(summary.income_by_method).map(([method, amount]) => (
                        <div key={method} className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1.5 dark:text-gray-300 text-gray-700">
                            {METHOD_ICONS[method] || <Wallet className="h-3.5 w-3.5" />}
                            {METHOD_LABELS[method] || method}:
                          </span>
                          <span className="font-medium text-green-600">
                            {formatCurrency(amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Desglose por metodo de pago: egresos (compras a proveedores) */}
                {summary?.expense_by_method && Object.keys(summary.expense_by_method).length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-medium flex items-center gap-1 dark:text-red-400 text-red-700">
                      <ArrowDownCircle className="h-3.5 w-3.5" /> Egresos por metodo de pago (compras):
                    </span>
                    <div className="space-y-1.5">
                      {Object.entries(summary.expense_by_method).map(([method, amount]) => (
                        <div key={method} className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1.5 dark:text-gray-300 text-gray-700">
                            {METHOD_ICONS[method] || <Wallet className="h-3.5 w-3.5" />}
                            {METHOD_LABELS[method] || method}:
                          </span>
                          <span className="font-medium text-red-600">
                            {formatCurrency(amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Separator className="dark:bg-gray-600 bg-gray-300" />
                
                <div className="flex justify-between items-center">
                  <span className="font-medium dark:text-gray-200 text-gray-800">
                    Monto esperado:
                  </span>
                  <span className="text-lg font-bold text-blue-600">
                    {summary ? formatCurrency(summary.expected_amount) : '-'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Movimientos de la sesion */}
            {movements.length > 0 && (
              <Card className="dark:bg-gray-700 dark:border-gray-600 bg-gray-50 border-gray-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm dark:text-gray-200 text-gray-700">
                    Movimientos de la Sesion ({movements.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                    {movements.map((mov) => (
                      <div
                        key={mov.id}
                        className="flex items-center justify-between text-sm p-2 rounded-md dark:bg-gray-600/50 bg-white border dark:border-gray-600 border-gray-200"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={mov.direction === 'in' ? 'text-green-600' : 'text-red-600'}>
                            {MOVEMENT_ICONS[mov.type]}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium dark:text-white text-gray-900 truncate">
                              {mov.label}
                              {mov.reference ? ` #${mov.reference}` : ''}
                            </p>
                            <p className="text-xs dark:text-gray-400 text-gray-500 truncate">
                              {mov.counterparty || 'Sin contraparte'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-xs dark:border-gray-500">
                            {METHOD_LABELS[mov.method] || mov.method}
                          </Badge>
                          <span className={`font-medium ${mov.direction === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                            {mov.direction === 'in' ? '+' : '-'}{formatCurrency(mov.amount)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Arqueo */}
            <Card className="dark:bg-gray-700 dark:border-gray-600 bg-gray-50 border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm dark:text-gray-200 text-gray-700">
                  Arqueo de Caja
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Monto contado */}
                <div className="space-y-2">
                  <Label htmlFor="final_amount" className="dark:text-gray-200 text-gray-700">
                    Monto Contado *
                  </Label>
                  <Input
                    id="final_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.final_amount}
                    onChange={(e) => handleInputChange('final_amount', parseFloat(e.target.value) || 0)}
                    className="dark:bg-gray-600 dark:border-gray-500 dark:text-white bg-white border-gray-300"
                    required
                  />
                </div>

                {/* Diferencia */}
                <div className="p-3 bg-gray-100 dark:bg-gray-600 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium dark:text-gray-200 text-gray-700">
                      Diferencia:
                    </span>
                    <span className={`text-lg font-bold ${getDifferenceColor()}`}>
                      {formatCurrency(getDifference())}
                    </span>
                  </div>
                  {getDifference() !== 0 && (
                    <p className="text-xs mt-1 dark:text-gray-400 text-gray-500">
                      {getDifference() > 0 ? 'Sobrante' : 'Faltante'} de efectivo
                    </p>
                  )}
                </div>

                {/* Notas */}
                <div className="space-y-2">
                  <Label htmlFor="notes" className="dark:text-gray-200 text-gray-700">
                    Observaciones del Cierre (Opcional)
                  </Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    placeholder="Observaciones del cierre, novedades, etc..."
                    className="dark:bg-gray-600 dark:border-gray-500 dark:text-white bg-white border-gray-300"
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Advertencia si hay diferencia */}
            {Math.abs(getDifference()) > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>⚠️ Atención:</strong> Hay una diferencia de {formatCurrency(Math.abs(getDifference()))} 
                  {getDifference() > 0 ? ' (sobrante)' : ' (faltante)'} en el arqueo.
                </p>
              </div>
            )}

            {/* Botones */}
            <div className="flex space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-red-600 hover:bg-red-700"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                    Cerrando...
                  </>
                ) : (
                  'Cerrar Caja'
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
