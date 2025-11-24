'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
// Importación con ruta relativa
import CurrencySelector from './CurrencySelector';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Declaración de tipo para CurrencySelector en caso de que no sea reconocido
interface CurrencySelectorProps {
  organizationId: number;
  onComplete: () => void;
}
import { useToast } from '@/components/ui/use-toast';

interface Currency {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  auto_update: boolean;
  // Campos de organization_currencies
  is_base: boolean;
  org_auto_update?: boolean;
}

interface CurrencyTableProps {
  organizationId: number;
}

export default function CurrencyTable({ organizationId }: CurrencyTableProps) {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openSelector, setOpenSelector] = useState(false);
  const { toast } = useToast();

  // Cargar monedas al iniciar
  useEffect(() => {
    loadCurrencies();
  }, [organizationId]);

  // Función para cargar monedas
  async function loadCurrencies() {
    try {
      setLoading(true);
      setError(null);

      // Consulta las monedas específicas de la organización junto con sus datos del catálogo global
      const { data, error } = await supabase
        .rpc('get_organization_currencies', {
          p_organization_id: organizationId
        });

      if (error) throw error;

      setCurrencies(data || []);
    } catch (err: any) {
      console.error('Error al cargar monedas:', err);
      setError('Error al cargar monedas: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  // Función para cambiar moneda base
  async function setBaseCurrency(code: string) {
    try {
      setLoading(true);

      // Llamamos a la función RPC para establecer la moneda base
      const { data, error } = await supabase
        .rpc('set_organization_base_currency', {
          p_organization_id: organizationId,
          p_currency_code: code
        });

      if (error) throw error;

      toast({
        title: 'Moneda base actualizada',
        description: 'Se ha establecido correctamente la moneda base.',
        variant: 'default',
      });

      // Recargar datos
      loadCurrencies();
    } catch (err: any) {
      console.error('Error al actualizar moneda base:', err);
      setError('Error al actualizar moneda base: ' + err.message);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la moneda base: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  // Función para cambiar actualización automática
  async function toggleAutoUpdate(code: string, currentValue: boolean) {
    try {
      setLoading(true);

      // Llamamos a la función RPC para actualizar la configuración de actualización automática
      const { error } = await supabase
        .rpc('set_currency_auto_update', {
          p_currency_code: code,
          p_auto_update: !currentValue,
          p_org_id: organizationId
        });

      if (error) throw error;

      toast({
        title: 'Configuración actualizada',
        description: `Actualización automática ${!currentValue ? 'activada' : 'desactivada'}.`,
      });

      // Recargar datos
      loadCurrencies();
    } catch (err: any) {
      console.error('Error al cambiar actualización automática:', err);
      setError('Error al cambiar actualización automática: ' + err.message);
      toast({
        title: 'Error',
        description: 'No se pudo cambiar la configuración: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  // Función para eliminar moneda
  async function deleteCurrency(code: string) {
    try {
      if (currencies.find(c => c.code === code)?.is_base) {
        toast({
          title: 'Error',
          description: 'No se puede eliminar la moneda base. Cambie la moneda base primero.',
          variant: 'destructive',
        });
        return;
      }

      if (!confirm('¿Está seguro de eliminar esta moneda? Esta acción no se puede deshacer.')) {
        return;
      }

      setLoading(true);

      // Elimina la relación organización-moneda
      const { error } = await supabase
        .rpc('remove_organization_currency', {
          p_organization_id: organizationId,
          p_currency_code: code
        });

      if (error) throw error;

      toast({
        title: 'Moneda eliminada',
        description: 'Se ha eliminado correctamente la moneda.',
      });

      // Recargar datos
      loadCurrencies();
    } catch (err: any) {
      console.error('Error al eliminar moneda:', err);
      setError('Error al eliminar moneda: ' + err.message);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la moneda: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
        <h3 className="text-base sm:text-lg font-medium dark:text-gray-300">Monedas Disponibles</h3>
        <Dialog open={openSelector} onOpenChange={setOpenSelector}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800 w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" /> Nueva Moneda
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md dark:bg-gray-800 dark:border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-lg dark:text-blue-400">Agregar Nueva Moneda</DialogTitle>
            </DialogHeader>
            <CurrencySelector 
              organizationId={organizationId} 
              onComplete={() => {
                setOpenSelector(false);
                loadCurrencies();
              }} 
            />
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4 dark:border-red-800 dark:bg-red-900/20">
          <AlertDescription className="text-sm dark:text-red-300">{error}</AlertDescription>
        </Alert>
      )}

      <div className="border rounded-md dark:border-gray-700 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <TableHead className="dark:text-gray-300 text-xs sm:text-sm">Código</TableHead>
              <TableHead className="dark:text-gray-300 text-xs sm:text-sm hidden md:table-cell">Nombre</TableHead>
              <TableHead className="dark:text-gray-300 text-xs sm:text-sm">Símbolo</TableHead>
              <TableHead className="dark:text-gray-300 text-xs sm:text-sm hidden lg:table-cell">Decimales</TableHead>
              <TableHead className="dark:text-gray-300 text-xs sm:text-sm">Base</TableHead>
              <TableHead className="dark:text-gray-300 text-xs sm:text-sm hidden sm:table-cell">Auto</TableHead>
              <TableHead className="dark:text-gray-300 text-xs sm:text-sm text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 dark:text-gray-400">
                  <RefreshCw className="animate-spin h-5 w-5 mx-auto mb-2 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm">Cargando monedas...</span>
                </TableCell>
              </TableRow>
            ) : currencies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 dark:text-gray-400">
                  <span className="text-sm">No hay monedas disponibles.</span>
                </TableCell>
              </TableRow>
            ) : (
              currencies.map((currency) => (
                <TableRow key={currency.code} className="dark:border-gray-700">
                  <TableCell className="font-medium text-xs sm:text-sm dark:text-gray-200">
                    {currency.code}
                  </TableCell>
                  <TableCell className="text-xs sm:text-sm dark:text-gray-300 hidden md:table-cell">{currency.name}</TableCell>
                  <TableCell className="text-xs sm:text-sm dark:text-gray-300">{currency.symbol}</TableCell>
                  <TableCell className="text-xs sm:text-sm dark:text-gray-300 hidden lg:table-cell">{currency.decimals}</TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Button
                        variant={currency.is_base ? "default" : "outline"}
                        size="sm"
                        onClick={() => !currency.is_base && setBaseCurrency(currency.code)}
                        disabled={currency.is_base}
                        className={
                          currency.is_base 
                            ? "bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800 text-xs h-7" 
                            : "dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700 text-xs h-7"
                        }
                      >
                        {currency.is_base ? "Base" : "Establecer"}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex justify-center">
                      <Switch
                        checked={currency.org_auto_update ?? currency.auto_update}
                        onCheckedChange={() => toggleAutoUpdate(currency.code, currency.org_auto_update ?? currency.auto_update)}
                        className="data-[state=checked]:bg-green-600 dark:data-[state=checked]:bg-green-700"
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-1 sm:space-x-2 justify-end">
                      <Button 
                        variant="destructive" 
                        size="icon"
                        onClick={() => deleteCurrency(currency.code)}
                        disabled={currency.is_base}
                        className="h-8 w-8 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
                      >
                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
