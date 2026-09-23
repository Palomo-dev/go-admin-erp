'use client';

import { useState } from 'react';
import { ArrowUpCircle, ArrowDownCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPortal } from 'react-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency } from '@/utils/Utils';
import { CajasService, claveErrorCaja } from './CajasService';
import type { CashMovement, CashMovementData } from './types';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

interface MovimientosDialogProps {
  onMovementAdded: (movement: CashMovement) => void;
  disabled?: boolean;
  /** Modo controlado: la pantalla pone su propio botón y no se dibuja el disparador. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Conceptos predefinidos (claves de `cajas.movimiento.conceptos`). Se guarda
 * el texto en el idioma de quien registra, igual que un concepto escrito a mano.
 */
const CONCEPTS_IN = [
  'fondoAdicional',
  'prestamo',
  'devolucion',
  'cambioBilletes',
  'ventaContadoEspecial',
  'otroIngreso'
] as const;

const CONCEPTS_OUT = [
  'gastosMenores',
  'retiroEfectivo',
  'compraInsumos',
  'cambioBilletes',
  'prestamoEmpleado',
  'otroEgreso'
] as const;

type ConceptoPredefinido = (typeof CONCEPTS_IN)[number] | (typeof CONCEPTS_OUT)[number];

export function MovimientosDialog({ onMovementAdded, disabled, open: controlledOpen, onOpenChange }: MovimientosDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('in');
  const t = useTranslations('cajas.movimiento');
  const tError = useTranslations('cajas.errores');
  const conceptosIn = CONCEPTS_IN.map((id) => ({ id, etiqueta: t(`conceptos.${id}`) }));
  const conceptosOut = CONCEPTS_OUT.map((id) => ({ id, etiqueta: t(`conceptos.${id}`) }));
  const [formData, setFormData] = useState<CashMovementData>({
    type: 'in',
    concept: '',
    amount: 0,
    notes: ''
  });

  const handleInputChange = (field: keyof CashMovementData, value: CashMovementData[keyof CashMovementData]) => {
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

  const handleConceptSelect = (id: ConceptoPredefinido, etiqueta: string) => {
    setFormData(prev => ({
      ...prev,
      concept: id === 'otroIngreso' || id === 'otroEgreso' ? '' : etiqueta
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.concept.trim()) {
      toast.error(t('conceptoRequerido'));
      return;
    }

    if (formData.amount <= 0) {
      toast.error(t('montoMayorCero'));
      return;
    }

    setLoading(true);
    try {
      const movement = await CajasService.addMovement(formData);
      const pendiente = movement.pending_sync ? 'si' : 'no';
      toast.success(formData.type === 'in' ? t('ingresoRegistrado', { pendiente }) : t('egresoRegistrado', { pendiente }), {
        description: t('toastDescripcion', { concepto: formData.concept, monto: formatCurrency(formData.amount), pendiente })
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
    } catch (error) {
      console.error('Error adding movement:', error);
      const clave = claveErrorCaja(error);
      toast.error(t('errorRegistrar'), {
        description: clave && tError.has(clave) ? tError(clave) : (error as Error)?.message
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!controlled && (
        <Button 
          size="lg"
          variant="outline"
          disabled={disabled}
          className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-5 w-5 mr-2" />
          {t('registrarMovimiento')}
        </Button>
      )}
      {open && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
          <div className="min-h-screen px-1 sm:px-4 py-2 sm:py-8 flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[97vh] sm:max-h-[90vh] overflow-hidden relative animate-in fade-in-0 zoom-in-95 duration-300 dark:bg-gray-800">
              <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between dark:bg-gray-800 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 flex items-center space-x-2">
                  <Plus className="h-5 w-5 text-blue-600" />
                  <span>{t('registrarMovimiento')}</span>
                </h2>
                <button type="button" aria-label={t('cerrar')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors dark:hover:bg-gray-700" onClick={() => setOpen(false)}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="overflow-y-auto max-h-[calc(90vh-80px)] bg-gray-50 dark:bg-gray-900">
                <div className="p-4 sm:p-6">
                  <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-2 dark:bg-gray-700">
            <TabsTrigger 
              value="in" 
              className="data-[state=active]:bg-green-600 data-[state=active]:text-white"
            >
              <ArrowUpCircle className="h-4 w-4 mr-2" />
              {t('ingreso')}
            </TabsTrigger>
            <TabsTrigger 
              value="out"
              className="data-[state=active]:bg-red-600 data-[state=active]:text-white"
            >
              <ArrowDownCircle className="h-4 w-4 mr-2" />
              {t('egreso')}
            </TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <TabsContent value="in" className="space-y-4 mt-0">
              <Card className="dark:bg-gray-700 dark:border-gray-600 bg-green-50 border-green-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-green-600 dark:text-green-400">
                    {t('ingresoEfectivo')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Conceptos predefinidos */}
                  <div className="space-y-2">
                    <Label className="dark:text-gray-200 text-gray-700">{t('concepto')}</Label>
                    <div className="grid grid-cols-1 gap-2">
                      {conceptosIn.map(({ id, etiqueta }) => (
                        <Button
                          key={id}
                          type="button"
                          variant={formData.concept === etiqueta ? "default" : "outline"}
                          size="sm"
                          className="justify-start text-left h-auto py-2"
                          onClick={() => handleConceptSelect(id, etiqueta)}
                        >
                          {etiqueta}
                        </Button>
                      ))}
                    </div>
                    {(formData.concept === '' || !conceptosIn.some((c) => c.etiqueta === formData.concept)) && (
                      <Input
                        placeholder={t('otroConceptoPlaceholder')}
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
              <Card className="dark:bg-gray-700 dark:border-gray-600 bg-red-50 border-red-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-red-600 dark:text-red-400">
                    {t('egresoEfectivo')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Conceptos predefinidos */}
                  <div className="space-y-2">
                    <Label className="dark:text-gray-200 text-gray-700">{t('concepto')}</Label>
                    <div className="grid grid-cols-1 gap-2">
                      {conceptosOut.map(({ id, etiqueta }) => (
                        <Button
                          key={id}
                          type="button"
                          variant={formData.concept === etiqueta ? "default" : "outline"}
                          size="sm"
                          className="justify-start text-left h-auto py-2"
                          onClick={() => handleConceptSelect(id, etiqueta)}
                        >
                          {etiqueta}
                        </Button>
                      ))}
                    </div>
                    {(formData.concept === '' || !conceptosOut.some((c) => c.etiqueta === formData.concept)) && (
                      <Input
                        placeholder={t('otroConceptoPlaceholder')}
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
              <Label htmlFor="amount" className="dark:text-gray-200 text-gray-700">
                {t('monto')}
              </Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                value={formData.amount || ''}
                onChange={(e) => handleInputChange('amount', parseFloat(e.target.value) || 0)}
                className="dark:bg-gray-600 dark:border-gray-500 dark:text-white bg-white border-gray-300"
                required
              />
              {formData.amount > 0 && (
                <p className="text-sm dark:text-gray-400 text-gray-500">
                  {t('equivaleA')} <span className={`font-medium ${activeTab === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(formData.amount)}
                  </span>
                </p>
              )}
            </div>

            {/* Notas */}
            <div className="space-y-2">
              <Label htmlFor="notes" className="dark:text-gray-200 text-gray-700">
                {t('observaciones')}
              </Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder={t('observacionesPlaceholder')}
                className="dark:bg-gray-600 dark:border-gray-500 dark:text-white bg-white border-gray-300"
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
                {t('cancelar')}
              </Button>
              <Button
                type="submit"
                className={`flex-1 ${activeTab === 'in' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                    {t('registrando')}
                  </>
                ) : (
                  activeTab === 'in' ? t('registrarIngreso') : t('registrarEgreso')
                )}
              </Button>
            </div>
          </form>
                  </Tabs>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
