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
  id: string;
  code: string;
  organization_id: number | null;
  name: string;
  symbol: string;
  decimals: number;
  is_base: boolean;
  auto_update: boolean;
  template_code?: string;
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

      const { data, error } = await supabase
        .from('currencies')
        .select('*')
        .or(`organization_id.eq.${organizationId},organization_id.is.null`)
        .order('is_base', { ascending: false })
        .order('code');

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
  async function setBaseCurrency(id: string) {
    try {
      setLoading(true);

      // Primero, quitar moneda base de todas las monedas
      const { error: updateError } = await supabase
        .from('currencies')
        .update({ is_base: false })
        .eq('organization_id', organizationId);

      if (updateError) throw updateError;

      // Establecer la nueva moneda base
      const { error } = await supabase
        .from('currencies')
        .update({ is_base: true })
        .eq('id', id);

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
  async function toggleAutoUpdate(id: string, currentValue: boolean) {
    try {
      setLoading(true);

      const { error } = await supabase
        .from('currencies')
        .update({ auto_update: !currentValue })
        .eq('id', id);

      if (error) throw error;

      // También llamar a la función RPC para mantener consistencia
      const { error: rpcError } = await supabase
        .rpc('set_currency_auto_update', {
          p_currency_code: currencies.find(c => c.id === id)?.code || '',
          p_auto_update: !currentValue,
          p_org_id: organizationId
        });

      if (rpcError) throw rpcError;

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
  async function deleteCurrency(id: string) {
    try {
      if (currencies.find(c => c.id === id)?.is_base) {
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

      const { error } = await supabase
        .from('currencies')
        .delete()
        .eq('id', id);

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
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium">Monedas Disponibles</h3>
        <Dialog open={openSelector} onOpenChange={setOpenSelector}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800">
              <Plus className="mr-2 h-4 w-4" /> Nueva Moneda
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Agregar Nueva Moneda</DialogTitle>
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
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="border rounded-md dark:border-gray-700">
        <Table>
          <TableHeader>
            <TableRow className="dark:border-gray-700">
              <TableHead className="dark:text-gray-300">Código</TableHead>
              <TableHead className="dark:text-gray-300">Nombre</TableHead>
              <TableHead className="dark:text-gray-300">Símbolo</TableHead>
              <TableHead className="dark:text-gray-300">Decimales</TableHead>
              <TableHead className="dark:text-gray-300">Base</TableHead>
              <TableHead className="dark:text-gray-300">Auto</TableHead>
              <TableHead className="dark:text-gray-300">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 dark:text-gray-400">
                  <RefreshCw className="animate-spin h-5 w-5 mx-auto mb-2" />
                  Cargando monedas...
                </TableCell>
              </TableRow>
            ) : currencies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 dark:text-gray-400">
                  No hay monedas disponibles.
                </TableCell>
              </TableRow>
            ) : (
              currencies.map((currency) => (
                <TableRow key={currency.id} className="dark:border-gray-700">
                  <TableCell className="font-medium dark:text-gray-200">
                    {currency.code}
                    {currency.organization_id === null && (
                      <Badge variant="outline" className="ml-2 dark:text-gray-300">Global</Badge>
                    )}
                  </TableCell>
                  <TableCell className="dark:text-gray-300">{currency.name}</TableCell>
                  <TableCell className="dark:text-gray-300">{currency.symbol}</TableCell>
                  <TableCell className="dark:text-gray-300">{currency.decimals}</TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Button
                        variant={currency.is_base ? "default" : "outline"}
                        size="sm"
                        onClick={() => !currency.is_base && setBaseCurrency(currency.id)}
                        disabled={currency.is_base || currency.organization_id === null}
                        className={
                          currency.is_base 
                            ? "bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800" 
                            : "dark:text-gray-200 dark:border-gray-600"
                        }
                      >
                        {currency.is_base ? "Base" : "Establecer"}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Switch
                        checked={currency.auto_update || false}
                        disabled={currency.organization_id === null}
                        onCheckedChange={() => toggleAutoUpdate(currency.id, currency.auto_update || false)}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2 justify-end">
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => deleteCurrency(currency.id)}
                        disabled={currency.organization_id === null || currency.is_base}
                      >
                        <Trash2 className="h-4 w-4" />
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
