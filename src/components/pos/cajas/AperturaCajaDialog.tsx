'use client';

import { useState, useEffect } from 'react';
import { Banknote, Lock, Store, UserCircle, Calendar, Globe, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPortal } from 'react-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/utils/Utils';
import { CajasService } from './CajasService';
import type { CashSession, OpenCashSessionData } from './types';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { supabase } from '@/lib/supabase/config';
import { toast } from 'sonner';

interface AperturaCajaDialogProps {
  onSessionOpened: (session: CashSession) => void;
  disabled?: boolean;
}

export function AperturaCajaDialog({ onSessionOpened, disabled }: AperturaCajaDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState<string>('');
  const [cashMode, setCashMode] = useState<'branch' | 'user'>('branch');
  const { organization } = useOrganization();
  const { branches, selectedBranchId } = useBranch();
  const [formData, setFormData] = useState<OpenCashSessionData>({
    initial_amount: 100000, // COP 100,000 por defecto
    notes: '',
    scope: 'branch'
  });

  const branchName = branches.find(b => b.id === selectedBranchId)?.name || 'Sucursal no seleccionada';

  // Cargar nombre del usuario actual y modo de cajas al abrir el diálogo
  useEffect(() => {
    if (open) {
      if (!userName) {
        const loadUserName = async () => {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('first_name, last_name')
                .eq('id', user.id)
                .single();
              if (profile) {
                setUserName(`${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Usuario');
              }
            }
          } catch (err) {
            console.warn('Error loading user name:', err);
          }
        };
        loadUserName();
      }
      // Cargar modo de cajas para decidir si se muestra el alcance global
      CajasService.getCashSessionMode()
        .then(setCashMode)
        .catch(() => setCashMode('branch'));
    }
  }, [open, userName]);

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
        notes: '',
        scope: 'branch'
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
    <>
      <Button 
        size="lg"
        disabled={disabled}
        className="bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
        onClick={() => setOpen(true)}
      >
        <Lock className="h-5 w-5 mr-2" />
        Abrir Caja
      </Button>
      {open && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
          <div className="min-h-screen px-1 sm:px-4 py-2 sm:py-8 flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[97vh] sm:max-h-[90vh] overflow-hidden relative animate-in fade-in-0 zoom-in-95 duration-300 dark:bg-gray-800">
              <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between dark:bg-gray-800 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 flex items-center space-x-2">
                  <Banknote className="h-5 w-5 text-green-600" />
                  <span>Apertura de Caja</span>
                </h2>
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors dark:hover:bg-gray-700" onClick={() => setOpen(false)}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="overflow-y-auto max-h-[calc(90vh-80px)] bg-gray-50 dark:bg-gray-900">
                <div className="p-4 sm:p-6">
                  <form onSubmit={handleSubmit} className="space-y-4">
          {/* Info de sucursal, cajero y fecha */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <Store className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Sucursal</p>
                  <p className="text-sm font-medium dark:text-white break-words whitespace-normal">{branchName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <UserCircle className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Cajero</p>
                  <p className="text-sm font-medium dark:text-white break-words whitespace-normal">{userName || 'Cargando...'}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
              <Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Fecha y hora</p>
                <p className="text-sm font-medium dark:text-white">
                  {new Date().toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Selector de alcance (oculto en modo 'user': la caja siempre es de la sucursal actual) */}
          {cashMode !== 'user' && (
          <div className="space-y-2">
            <Label className="dark:text-gray-200 text-gray-700">Alcance de la Caja</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleInputChange('scope', 'branch')}
                className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all text-left ${
                  formData.scope !== 'global'
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20 dark:border-green-600'
                    : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700'
                }`}
              >
                <Building2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                <div>
                  <p className="text-sm font-medium dark:text-white text-gray-900">Esta sucursal</p>
                  <p className="text-xs dark:text-gray-400 text-gray-500">{branchName}</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleInputChange('scope', 'global')}
                className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all text-left ${
                  formData.scope === 'global'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600'
                    : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700'
                }`}
              >
                <Globe className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                <div>
                  <p className="text-sm font-medium dark:text-white text-gray-900">Todas las sucursales</p>
                  <p className="text-xs dark:text-gray-400 text-gray-500">Caja global</p>
                </div>
              </button>
            </div>
            {formData.scope === 'global' && (
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Todos los usuarios de todas las sucursales registrarán ventas en esta caja.
              </p>
            )}
          </div>
          )}

          {/* Aviso en modo 'user': cada cajero gestiona su propia caja */}
          {cashMode === 'user' && (
            <div className="space-y-2">
              <Label className="dark:text-gray-200 text-gray-700">Alcance de la Caja</Label>
              <div className="flex items-center gap-2 p-3 rounded-lg border-2 border-green-500 bg-green-50 dark:bg-green-900/20 dark:border-green-600">
                <UserCircle className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                <div>
                  <p className="text-sm font-medium dark:text-white text-gray-900">Mi caja en {branchName}</p>
                  <p className="text-xs dark:text-gray-400 text-gray-500">
                    Cada cajero abre y gestiona su propia caja de forma independiente.
                  </p>
                </div>
              </div>
              <p className="text-xs text-green-600 dark:text-green-400">
                Esta caja registrará únicamente tus ventas y movimientos. Otros cajeros de la sucursal tendrán sus propias cajas.
              </p>
            </div>
          )}

          <Separator />

          <Card className="dark:bg-gray-700 dark:border-gray-600 bg-gray-50 border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm dark:text-gray-200 text-gray-700">
                Detalles de Apertura
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Monto inicial */}
              <div className="space-y-2">
                <Label htmlFor="initial_amount" className="dark:text-gray-200 text-gray-700">
                  Monto Inicial *
                </Label>
                <Input
                  id="initial_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.initial_amount}
                  onChange={(e) => handleInputChange('initial_amount', parseFloat(e.target.value) || 0)}
                  className="dark:bg-gray-600 dark:border-gray-500 dark:text-white bg-white border-gray-300"
                  required
                />
                <p className="text-sm dark:text-gray-400 text-gray-500">
                  Equivale a: <span className="font-medium text-green-600">
                    {formatCurrency(formData.initial_amount)}
                  </span>
                </p>
              </div>

              {/* Notas */}
              <div className="space-y-2">
                <Label htmlFor="notes" className="dark:text-gray-200 text-gray-700">
                  Notas (Opcional)
                </Label>
                <RichTextEditor
                  value={formData.notes || ''}
                  onChange={(html) => handleInputChange('notes', html)}
                  placeholder="Observaciones de apertura..."
                  className="dark:bg-gray-600 dark:border-gray-500 dark:text-white bg-white border-gray-300"
                  minHeight={60}
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
