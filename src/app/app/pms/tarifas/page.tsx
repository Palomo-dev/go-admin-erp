'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { RatesHeader, RatesList } from '@/components/pms/tarifas';
import RatesService, { type Rate } from '@/lib/services/ratesService';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Loader2 } from 'lucide-react';

export default function TarifasPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();

  const [rates, setRates] = useState<Rate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (organization?.id) {
      loadData();
    }
  }, [organization?.id]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const ratesData = await RatesService.getRates(organization!.id);
      setRates(ratesData);
    } catch (error) {
      console.error('Error cargando tarifas:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las tarifas.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewRate = () => {
    toast({
      title: 'Crear Tarifa',
      description: 'Funcionalidad pendiente de implementar.',
    });
  };

  const handleImport = () => {
    toast({
      title: 'Importar Tarifas',
      description: 'Funcionalidad de importación CSV pendiente.',
    });
  };

  const handleEdit = (rate: Rate) => {
    toast({
      title: 'Editar Tarifa',
      description: `Tarifa ID: ${rate.id.slice(0, 8)}`,
    });
  };

  const handleDelete = async (rateId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta tarifa?')) return;

    try {
      await RatesService.deleteRate(rateId);
      toast({
        title: 'Tarifa eliminada',
        description: 'La tarifa se eliminó correctamente.',
      });
      await loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la tarifa.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Cargando tarifas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <RatesHeader onNewRate={handleNewRate} onImport={handleImport} />
      
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Total Tarifas
            </p>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
              {rates.length}
            </p>
          </div>
          
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Tipos de Espacio
            </p>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">
              {new Set(rates.map(r => r.space_type_id)).size}
            </p>
          </div>
          
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Precio Promedio
            </p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
              ${rates.length > 0 
                ? Math.round(rates.reduce((sum, r) => sum + Number(r.price), 0) / rates.length).toLocaleString()
                : 0}
            </p>
          </div>
        </div>

        <RatesList rates={rates} onEdit={handleEdit} onDelete={handleDelete} />
      </div>
    </div>
  );
}
