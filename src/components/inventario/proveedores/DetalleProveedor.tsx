"use client";

import React, { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { X, Mail, Phone, FileText, CalendarDays, ShoppingCart, Clock, BadgePercent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Proveedor, CompraProveedor } from './types';
import { formatCurrency } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';

interface DetalleProveedorProps {
  proveedor: Proveedor;
  onClose: () => void;
}

/**
 * Componente para mostrar detalles completos de un proveedor
 * 
 * Incluye información general, condiciones de pago, historial de compras y cumplimiento
 */
const DetalleProveedor: React.FC<DetalleProveedorProps> = ({
  proveedor,
  onClose
}) => {
  const { theme } = useTheme();
  const [historialCompras, setHistorialCompras] = useState<CompraProveedor[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(true);
  
  useEffect(() => {
    const cargarHistorialCompras = async () => {
      if (!proveedor?.id) return;
      
      try {
        setLoadingHistorial(true);
        // Consulta las órdenes de compra realizadas a este proveedor
        const { data, error } = await supabase
          .from('purchase_orders')
          .select(`
            id, 
            total,
            expected_date,
            created_at,
            status
          `)
          .eq('supplier_id', proveedor.id)
          .order('created_at', { ascending: false })
          .limit(10);
        
        if (error) throw error;
        
        if (data) {
          // Transformamos los datos al formato que espera nuestro componente
          const compras: CompraProveedor[] = data.map((orden) => ({
            id: orden.id,
            fecha: orden.created_at,
            total: orden.total,
            estado: orden.status,
            fecha_entrega_esperada: orden.expected_date
          }));
          
          setHistorialCompras(compras);
        }
      } catch (error) {
        console.error('Error al cargar el historial de compras:', error);
      } finally {
        setLoadingHistorial(false);
      }
    };
    
    cargarHistorialCompras();
  }, [proveedor?.id]);
  
  // Función para obtener el color del estado de una compra
  const getColorEstado = (estado: string) => {
    switch (estado) {
      case 'received':
        return theme === 'dark' ? 'text-green-400' : 'text-green-600';
      case 'partial':
        return theme === 'dark' ? 'text-yellow-400' : 'text-yellow-600';
      case 'cancelled':
        return theme === 'dark' ? 'text-red-400' : 'text-red-600';
      case 'sent':
        return theme === 'dark' ? 'text-blue-400' : 'text-blue-600';
      default:
        return theme === 'dark' ? 'text-gray-400' : 'text-gray-600';
    }
  };
  
  // Función para traducir el estado de una compra
  const traducirEstado = (estado: string) => {
    const traducciones: Record<string, string> = {
      'draft': 'Borrador',
      'sent': 'Enviada',
      'partial': 'Parcial',
      'received': 'Recibida',
      'closed': 'Cerrada',
      'cancelled': 'Cancelada'
    };
    
    return traducciones[estado] || estado;
  };
  
  // Función para formatear una fecha
  const formatFecha = (fecha: string | undefined) => {
    if (!fecha) return '-';
    return new Date(fecha).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className={`w-full max-w-4xl rounded-lg shadow-lg ${
        theme === 'dark' ? 'bg-gray-900' : 'bg-white'
      }`}>
        <div className={`flex items-center justify-between p-4 border-b ${
          theme === 'dark' ? 'border-gray-800' : 'border-gray-200'
        }`}>
          <h2 className={`text-xl font-semibold ${
            theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
          }`}>
            Detalle del Proveedor
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className={theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        
        <div className="p-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Información general */}
          <div className={`rounded-md p-4 ${
            theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'
          }`}>
            <h3 className={`text-lg font-medium mb-4 ${
              theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
            }`}>
              Información General
            </h3>
            
            <div className="space-y-3">
              <div>
                <p className={`text-sm ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  Nombre
                </p>
                <p className="font-medium">{proveedor.name}</p>
              </div>
              
              {proveedor.nit && (
                <div>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    NIT / Documento
                  </p>
                  <p className="font-medium">{proveedor.nit}</p>
                </div>
              )}
              
              {proveedor.contact && (
                <div>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Persona de Contacto
                  </p>
                  <p className="font-medium">{proveedor.contact}</p>
                </div>
              )}
              
              {proveedor.phone && (
                <div className="flex items-center gap-2">
                  <Phone className={`h-4 w-4 ${
                    theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
                  }`} />
                  <p>{proveedor.phone}</p>
                </div>
              )}
              
              {proveedor.email && (
                <div className="flex items-center gap-2">
                  <Mail className={`h-4 w-4 ${
                    theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
                  }`} />
                  <p>{proveedor.email}</p>
                </div>
              )}
              
              {proveedor.created_at && (
                <div className="flex items-center gap-2 text-sm">
                  <CalendarDays className={`h-4 w-4 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`} />
                  <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>
                    Registrado el {formatFecha(proveedor.created_at)}
                  </p>
                </div>
              )}
            </div>
            
            {proveedor.notes && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className={`h-4 w-4 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`} />
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Notas
                  </p>
                </div>
                <p className={`text-sm whitespace-pre-line ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                }`}>
                  {proveedor.notes}
                </p>
              </div>
            )}
          </div>
          
          {/* Condiciones de pago */}
          <div className={`rounded-md p-4 ${
            theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'
          }`}>
            <h3 className={`text-lg font-medium mb-4 ${
              theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
            }`}>
              Condiciones de Pago
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Clock className={`h-5 w-5 ${
                  theme === 'dark' ? 'text-yellow-400' : 'text-yellow-600'
                }`} />
                <div>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Días de crédito
                  </p>
                  <p className="font-medium">
                    {proveedor.condiciones_pago?.dias_credito || 0} días
                  </p>
                </div>
              </div>
              
              {proveedor.condiciones_pago?.limite_credito && (
                <div className="flex items-center gap-3">
                  <ShoppingCart className={`h-5 w-5 ${
                    theme === 'dark' ? 'text-green-400' : 'text-green-600'
                  }`} />
                  <div>
                    <p className={`text-sm ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      Límite de crédito
                    </p>
                    <p className="font-medium">
                      {formatCurrency(proveedor.condiciones_pago.limite_credito)}
                    </p>
                  </div>
                </div>
              )}
              
              {proveedor.condiciones_pago?.metodo_pago_preferido && (
                <div>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Método de pago preferido
                  </p>
                  <p className="font-medium">
                    {proveedor.condiciones_pago.metodo_pago_preferido}
                  </p>
                </div>
              )}
              
              {proveedor.condiciones_pago?.descuento_pronto_pago !== undefined && 
               proveedor.condiciones_pago.descuento_pronto_pago > 0 && (
                <div className="flex items-center gap-3">
                  <BadgePercent className={`h-5 w-5 ${
                    theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
                  }`} />
                  <div>
                    <p className={`text-sm ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      Descuento por pronto pago
                    </p>
                    <p className="font-medium">
                      {proveedor.condiciones_pago.descuento_pronto_pago}%
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Indicador de cumplimiento */}
          <div className={`rounded-md p-4 ${
            theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'
          }`}>
            <h3 className={`text-lg font-medium mb-4 ${
              theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
            }`}>
              Cumplimiento
            </h3>
            
            {proveedor.cumplimiento !== undefined ? (
              <>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 mb-2">
                  <div 
                    className={`h-4 rounded-full ${
                      proveedor.cumplimiento >= 80
                        ? theme === 'dark' ? 'bg-green-600' : 'bg-green-500'
                        : proveedor.cumplimiento >= 60
                          ? theme === 'dark' ? 'bg-yellow-600' : 'bg-yellow-500'
                          : theme === 'dark' ? 'bg-red-600' : 'bg-red-500'
                    }`}
                    style={{ width: `${proveedor.cumplimiento}%` }}
                  />
                </div>
                <p className="text-center text-xl font-bold">
                  {proveedor.cumplimiento}%
                </p>
                <p className={`text-center text-sm mt-1 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  {proveedor.cumplimiento >= 80
                    ? 'Excelente cumplimiento'
                    : proveedor.cumplimiento >= 60
                      ? 'Cumplimiento aceptable'
                      : 'Bajo cumplimiento'
                  }
                </p>
              </>
            ) : (
              <p className={`text-center ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}>
                No hay datos de cumplimiento disponibles
              </p>
            )}
          </div>
          
          {/* Historial de compras */}
          <div className={`col-span-1 md:col-span-3 rounded-md p-4 ${
            theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'
          }`}>
            <h3 className={`text-lg font-medium mb-4 ${
              theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
            }`}>
              Historial de Compras
            </h3>
            
            {loadingHistorial ? (
              <p className="text-center py-4">Cargando historial...</p>
            ) : historialCompras.length === 0 ? (
              <p className={`text-center py-4 ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}>
                No hay compras registradas para este proveedor
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className={`w-full ${
                  theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
                }`}>
                  <thead>
                    <tr className={theme === 'dark' ? 'border-b border-gray-700' : 'border-b border-gray-300'}>
                      <th className="text-left py-2 px-4">ID</th>
                      <th className="text-left py-2 px-4">Fecha</th>
                      <th className="text-left py-2 px-4">Entrega Esperada</th>
                      <th className="text-left py-2 px-4">Total</th>
                      <th className="text-left py-2 px-4">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historialCompras.map((compra) => (
                      <tr 
                        key={compra.id}
                        className={theme === 'dark' ? 'border-b border-gray-700' : 'border-b border-gray-200'}
                      >
                        <td className="py-2 px-4">{compra.id}</td>
                        <td className="py-2 px-4">{formatFecha(compra.fecha)}</td>
                        <td className="py-2 px-4">{formatFecha(compra.fecha_entrega_esperada)}</td>
                        <td className="py-2 px-4 font-medium">{formatCurrency(compra.total || 0)}</td>
                        <td className={`py-2 px-4 font-medium ${getColorEstado(compra.estado || '')}`}>
                          {traducirEstado(compra.estado || '')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        
        <div className={`flex justify-end p-4 border-t ${
          theme === 'dark' ? 'border-gray-800' : 'border-gray-200'
        }`}>
          <Button
            onClick={onClose}
            className={`${
              theme === 'dark' 
                ? 'bg-gray-800 hover:bg-gray-700 text-gray-200' 
                : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
            }`}
          >
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DetalleProveedor;
