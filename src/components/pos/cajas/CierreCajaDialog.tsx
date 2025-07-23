'use client';

import { useState, useEffect } from 'react';
import { Calculator, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/utils/Utils';
import { CajasService } from './CajasService';
import type { CashSession, CashSummary, CloseCashSessionData } from './types';
import { toast } from 'sonner';

interface CierreCajaDialogProps {
  session: CashSession;
  onSessionClosed: (session: CashSession) => void;
}

export function CierreCajaDialog({ session, onSessionClosed }: CierreCajaDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summary, setSummary] = useState<CashSummary | null>(null);
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
      const cashSummary = await CajasService.getCashSummary(session.id);
      setSummary(cashSummary);
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
      
      <DialogContent className="max-w-2xl dark:bg-gray-800 light:bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 dark:text-white light:text-gray-900">
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
            <Card className="dark:bg-gray-700 dark:border-gray-600 light:bg-gray-50 light:border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm dark:text-gray-200 light:text-gray-700">
                  Resumen de Movimientos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="dark:text-gray-400 light:text-gray-600">Monto inicial:</span>
                    <p className="font-medium dark:text-white light:text-gray-900">
                      {summary ? formatCurrency(summary.initial_amount) : '-'}
                    </p>
                  </div>
                  <div>
                    <span className="dark:text-gray-400 light:text-gray-600">Ventas en efectivo:</span>
                    <p className="font-medium text-green-600">
                      {summary ? formatCurrency(summary.sales_cash) : '-'}
                    </p>
                  </div>
                  <div>
                    <span className="dark:text-gray-400 light:text-gray-600">Ingresos:</span>
                    <p className="font-medium text-blue-600">
                      {summary ? formatCurrency(summary.cash_in) : '-'}
                    </p>
                  </div>
                  <div>
                    <span className="dark:text-gray-400 light:text-gray-600">Egresos:</span>
                    <p className="font-medium text-red-600">
                      {summary ? formatCurrency(summary.cash_out) : '-'}
                    </p>
                  </div>
                </div>
                
                <Separator className="dark:bg-gray-600 light:bg-gray-300" />
                
                <div className="flex justify-between items-center">
                  <span className="font-medium dark:text-gray-200 light:text-gray-800">
                    Monto esperado:
                  </span>
                  <span className="text-lg font-bold text-blue-600">
                    {summary ? formatCurrency(summary.expected_amount) : '-'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Arqueo */}
            <Card className="dark:bg-gray-700 dark:border-gray-600 light:bg-gray-50 light:border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm dark:text-gray-200 light:text-gray-700">
                  Arqueo de Caja
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Monto contado */}
                <div className="space-y-2">
                  <Label htmlFor="final_amount" className="dark:text-gray-200 light:text-gray-700">
                    Monto Contado *
                  </Label>
                  <Input
                    id="final_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.final_amount}
                    onChange={(e) => handleInputChange('final_amount', parseFloat(e.target.value) || 0)}
                    className="dark:bg-gray-600 dark:border-gray-500 dark:text-white light:bg-white light:border-gray-300"
                    required
                  />
                </div>

                {/* Diferencia */}
                <div className="p-3 bg-gray-100 dark:bg-gray-600 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium dark:text-gray-200 light:text-gray-700">
                      Diferencia:
                    </span>
                    <span className={`text-lg font-bold ${getDifferenceColor()}`}>
                      {formatCurrency(getDifference())}
                    </span>
                  </div>
                  {getDifference() !== 0 && (
                    <p className="text-xs mt-1 dark:text-gray-400 light:text-gray-500">
                      {getDifference() > 0 ? 'Sobrante' : 'Faltante'} de efectivo
                    </p>
                  )}
                </div>

                {/* Notas */}
                <div className="space-y-2">
                  <Label htmlFor="notes" className="dark:text-gray-200 light:text-gray-700">
                    Observaciones del Cierre (Opcional)
                  </Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    placeholder="Observaciones del cierre, novedades, etc..."
                    className="dark:bg-gray-600 dark:border-gray-500 dark:text-white light:bg-white light:border-gray-300"
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
