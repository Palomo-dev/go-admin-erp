'use client';

import { useState, useEffect } from 'react';
import { ArrowUpCircle, ArrowDownCircle, Clock, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/utils/Utils';
import { CajasService } from './CajasService';
import type { CashMovement } from './types';

interface MovimientosListProps {
  sessionId: number;
  refreshTrigger?: number; // Para forzar actualización desde componente padre
}

export function MovimientosList({ sessionId, refreshTrigger }: MovimientosListProps) {
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMovements();
  }, [sessionId, refreshTrigger]);

  const loadMovements = async () => {
    setLoading(true);
    try {
      const data = await CajasService.getSessionMovements(sessionId);
      setMovements(data);
    } catch (error) {
      console.error('Error loading movements:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTotalByType = (type: 'in' | 'out') => {
    return movements
      .filter(m => m.type === type)
      .reduce((sum, m) => sum + Number(m.amount), 0);
  };

  if (loading) {
    return (
      <Card className="dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg dark:text-white light:text-gray-900">
            Movimientos de Caja
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent" />
            <span className="ml-2 dark:text-gray-300">Cargando movimientos...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-200">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg dark:text-white light:text-gray-900">
            Movimientos de Caja
          </CardTitle>
          <div className="flex space-x-4 text-sm">
            <div className="text-center">
              <p className="text-green-600 font-medium">
                {formatCurrency(getTotalByType('in'))}
              </p>
              <p className="dark:text-gray-400 light:text-gray-500">Ingresos</p>
            </div>
            <div className="text-center">
              <p className="text-red-600 font-medium">
                {formatCurrency(getTotalByType('out'))}
              </p>
              <p className="dark:text-gray-400 light:text-gray-500">Egresos</p>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {movements.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="dark:text-gray-400 light:text-gray-500 mb-2">
              No hay movimientos registrados
            </p>
            <p className="text-sm dark:text-gray-500 light:text-gray-400">
              Los ingresos y egresos aparecerán aquí
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {movements.map((movement, index) => (
              <div key={movement.id}>
                <div className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  {/* Icono del tipo */}
                  <div className={`flex-shrink-0 p-2 rounded-full ${
                    movement.type === 'in' 
                      ? 'bg-green-100 dark:bg-green-900/20' 
                      : 'bg-red-100 dark:bg-red-900/20'
                  }`}>
                    {movement.type === 'in' ? (
                      <ArrowUpCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <ArrowDownCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                    )}
                  </div>

                  {/* Contenido */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium dark:text-white light:text-gray-900">
                          {movement.concept}
                        </p>
                        <div className="flex items-center space-x-2 mt-1">
                          <Clock className="h-3 w-3 dark:text-gray-500" />
                          <span className="text-sm dark:text-gray-400 light:text-gray-500">
                            {formatDate(movement.created_at)}
                          </span>
                        </div>
                        {movement.notes && (
                          <p className="text-sm dark:text-gray-400 light:text-gray-600 mt-1">
                            {movement.notes}
                          </p>
                        )}
                      </div>

                      {/* Monto */}
                      <div className="text-right flex-shrink-0 ml-4">
                        <Badge 
                          variant="secondary"
                          className={`${
                            movement.type === 'in'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                          }`}
                        >
                          {movement.type === 'in' ? '+' : '-'}{formatCurrency(movement.amount)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                {index < movements.length - 1 && (
                  <Separator className="dark:bg-gray-700 light:bg-gray-200" />
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
