'use client';

import { useState } from 'react';
import { Banknote, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/utils/Utils';
import { CajasService } from './CajasService';
import type { CashSession, OpenCashSessionData } from './types';
import { toast } from 'sonner';

interface AperturaCajaDialogProps {
  onSessionOpened: (session: CashSession) => void;
  disabled?: boolean;
}

export function AperturaCajaDialog({ onSessionOpened, disabled }: AperturaCajaDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<OpenCashSessionData>({
    initial_amount: 100000, // COP 100,000 por defecto
    notes: ''
  });

  const handleInputChange = (field: keyof OpenCashSessionData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.initial_amount < 0) {
      toast.error('El monto inicial no puede ser negativo');
      return;
    }

    setLoading(true);
    try {
      const session = await CajasService.openSession(formData);
      toast.success('Caja abierta exitosamente', {
        description: `Monto inicial: ${formatCurrency(session.initial_amount)}`
      });
      
      onSessionOpened(session);
      setOpen(false);
      
      // Resetear formulario
      setFormData({
        initial_amount: 100000,
        notes: ''
      });
    } catch (error: any) {
      console.error('Error opening cash session:', error);
      toast.error('Error al abrir caja', {
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
          disabled={disabled}
          className="bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
        >
          <Lock className="h-5 w-5 mr-2" />
          Abrir Caja
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-md dark:bg-gray-800 light:bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 dark:text-white light:text-gray-900">
            <Banknote className="h-5 w-5 text-green-600" />
            <span>Apertura de Caja</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Card className="dark:bg-gray-700 dark:border-gray-600 light:bg-gray-50 light:border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm dark:text-gray-200 light:text-gray-700">
                Información de Apertura
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Monto inicial */}
              <div className="space-y-2">
                <Label htmlFor="initial_amount" className="dark:text-gray-200 light:text-gray-700">
                  Monto Inicial *
                </Label>
                <Input
                  id="initial_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.initial_amount}
                  onChange={(e) => handleInputChange('initial_amount', parseFloat(e.target.value) || 0)}
                  className="dark:bg-gray-600 dark:border-gray-500 dark:text-white light:bg-white light:border-gray-300"
                  required
                />
                <p className="text-sm dark:text-gray-400 light:text-gray-500">
                  Equivale a: <span className="font-medium text-green-600">
                    {formatCurrency(formData.initial_amount)}
                  </span>
                </p>
              </div>

              {/* Notas */}
              <div className="space-y-2">
                <Label htmlFor="notes" className="dark:text-gray-200 light:text-gray-700">
                  Notas (Opcional)
                </Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  placeholder="Observaciones de apertura..."
                  className="dark:bg-gray-600 dark:border-gray-500 dark:text-white light:bg-white light:border-gray-300"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Información importante */}
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Importante:</strong> Una vez abierta la caja, podrás registrar ventas, 
              ingresos y egresos hasta el momento del cierre.
            </p>
          </div>

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
              className="flex-1 bg-green-600 hover:bg-green-700"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                  Abriendo...
                </>
              ) : (
                'Abrir Caja'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
