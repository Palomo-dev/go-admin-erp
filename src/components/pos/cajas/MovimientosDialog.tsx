'use client';

import { useState } from 'react';
import { ArrowUpCircle, ArrowDownCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency } from '@/utils/Utils';
import { CajasService } from './CajasService';
import type { CashMovement, CashMovementData } from './types';
import { toast } from 'sonner';

interface MovimientosDialogProps {
  onMovementAdded: (movement: CashMovement) => void;
  disabled?: boolean;
}

const CONCEPTS_IN = [
  'Fondo adicional',
  'Préstamo',
  'Devolución',
  'Cambio de billetes',
  'Venta contado especial',
  'Otro ingreso'
];

const CONCEPTS_OUT = [
  'Gastos menores',
  'Retiro de efectivo',
  'Compra insumos',
  'Cambio de billetes',
  'Préstamo a empleado',
  'Otro egreso'
];

export function MovimientosDialog({ onMovementAdded, disabled }: MovimientosDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('in');
  const [formData, setFormData] = useState<CashMovementData>({
    type: 'in',
    concept: '',
    amount: 0,
    notes: ''
  });

  const handleInputChange = (field: keyof CashMovementData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setFormData(prev => ({
      ...prev,
      type: value as 'in' | 'out',
      concept: '',
      amount: 0,
      notes: ''
    }));
  };

  const handleConceptSelect = (concept: string) => {
    setFormData(prev => ({
      ...prev,
      concept: concept === 'Otro ingreso' || concept === 'Otro egreso' ? '' : concept
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.concept.trim()) {
      toast.error('El concepto es requerido');
      return;
    }

    if (formData.amount <= 0) {
      toast.error('El monto debe ser mayor a cero');
      return;
    }

    setLoading(true);
    try {
      const movement = await CajasService.addMovement(formData);
      toast.success(`${formData.type === 'in' ? 'Ingreso' : 'Egreso'} registrado`, {
        description: `${formData.concept}: ${formatCurrency(formData.amount)}`
      });
      
      onMovementAdded(movement);
      setOpen(false);
      
      // Resetear formulario
      setFormData({
        type: 'in',
        concept: '',
        amount: 0,
        notes: ''
      });
      setActiveTab('in');
    } catch (error: any) {
      console.error('Error adding movement:', error);
      toast.error('Error al registrar movimiento', {
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
          variant="outline"
          disabled={disabled}
          className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <Plus className="h-5 w-5 mr-2" />
          Registrar Movimiento
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-md dark:bg-gray-800 light:bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 dark:text-white light:text-gray-900">
            <Plus className="h-5 w-5 text-blue-600" />
            <span>Registrar Movimiento</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-2 dark:bg-gray-700">
            <TabsTrigger 
              value="in" 
              className="data-[state=active]:bg-green-600 data-[state=active]:text-white"
            >
              <ArrowUpCircle className="h-4 w-4 mr-2" />
              Ingreso
            </TabsTrigger>
            <TabsTrigger 
              value="out"
              className="data-[state=active]:bg-red-600 data-[state=active]:text-white"
            >
              <ArrowDownCircle className="h-4 w-4 mr-2" />
              Egreso
            </TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <TabsContent value="in" className="space-y-4 mt-0">
              <Card className="dark:bg-gray-700 dark:border-gray-600 light:bg-green-50 light:border-green-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-green-600 dark:text-green-400">
                    Ingreso de Efectivo
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Conceptos predefinidos */}
                  <div className="space-y-2">
                    <Label className="dark:text-gray-200 light:text-gray-700">Concepto</Label>
                    <div className="grid grid-cols-1 gap-2">
                      {CONCEPTS_IN.map((concept) => (
                        <Button
                          key={concept}
                          type="button"
                          variant={formData.concept === concept ? "default" : "outline"}
                          size="sm"
                          className="justify-start text-left h-auto py-2"
                          onClick={() => handleConceptSelect(concept)}
                        >
                          {concept}
                        </Button>
                      ))}
                    </div>
                    {(formData.concept === '' || !CONCEPTS_IN.includes(formData.concept)) && (
                      <Input
                        placeholder="Especificar otro concepto..."
                        value={formData.concept}
                        onChange={(e) => handleInputChange('concept', e.target.value)}
                        className="dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                        required
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="out" className="space-y-4 mt-0">
              <Card className="dark:bg-gray-700 dark:border-gray-600 light:bg-red-50 light:border-red-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-red-600 dark:text-red-400">
                    Egreso de Efectivo
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Conceptos predefinidos */}
                  <div className="space-y-2">
                    <Label className="dark:text-gray-200 light:text-gray-700">Concepto</Label>
                    <div className="grid grid-cols-1 gap-2">
                      {CONCEPTS_OUT.map((concept) => (
                        <Button
                          key={concept}
                          type="button"
                          variant={formData.concept === concept ? "default" : "outline"}
                          size="sm"
                          className="justify-start text-left h-auto py-2"
                          onClick={() => handleConceptSelect(concept)}
                        >
                          {concept}
                        </Button>
                      ))}
                    </div>
                    {(formData.concept === '' || !CONCEPTS_OUT.includes(formData.concept)) && (
                      <Input
                        placeholder="Especificar otro concepto..."
                        value={formData.concept}
                        onChange={(e) => handleInputChange('concept', e.target.value)}
                        className="dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                        required
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Monto - común para ambas tabs */}
            <div className="space-y-2">
              <Label htmlFor="amount" className="dark:text-gray-200 light:text-gray-700">
                Monto *
              </Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                value={formData.amount || ''}
                onChange={(e) => handleInputChange('amount', parseFloat(e.target.value) || 0)}
                className="dark:bg-gray-600 dark:border-gray-500 dark:text-white light:bg-white light:border-gray-300"
                required
              />
              {formData.amount > 0 && (
                <p className="text-sm dark:text-gray-400 light:text-gray-500">
                  Equivale a: <span className={`font-medium ${activeTab === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(formData.amount)}
                  </span>
                </p>
              )}
            </div>

            {/* Notas */}
            <div className="space-y-2">
              <Label htmlFor="notes" className="dark:text-gray-200 light:text-gray-700">
                Observaciones (Opcional)
              </Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Detalles adicionales..."
                className="dark:bg-gray-600 dark:border-gray-500 dark:text-white light:bg-white light:border-gray-300"
                rows={2}
              />
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
                className={`flex-1 ${activeTab === 'in' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                    Registrando...
                  </>
                ) : (
                  `Registrar ${activeTab === 'in' ? 'Ingreso' : 'Egreso'}`
                )}
              </Button>
            </div>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
