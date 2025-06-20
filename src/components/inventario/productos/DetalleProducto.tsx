"use client";

import React, { useState } from 'react';
import { Producto, EtiquetaProducto, MovimientoInventario } from './types';
import HistorialKardex from './HistorialKardex';
import RegistrarMovimientoInventario from './RegistrarMovimientoInventario';

interface DetalleProductoProps {
  product: Producto;
  onEdit: () => void;
  movimientos?: MovimientoInventario[];
  onRegistrarMovimiento?: (movimiento: Omit<MovimientoInventario, 'id'>) => void;
}

/**
 * Componente para mostrar el detalle de un producto
 * 
 * Muestra información detallada del producto seleccionado
 * junto con sus variantes y datos complementarios
 */
const DetalleProducto: React.FC<DetalleProductoProps> = ({ 
  product, 
  onEdit,
  movimientos = [], // Si no se proporcionan movimientos, usar array vacío 
  onRegistrarMovimiento
}) => {
  const [mostrarRegistroMovimiento, setMostrarRegistroMovimiento] = useState<boolean>(false);

  // Estado local para simular la distribución de stock por sucursal
  const sucursales = [
    { id: 'suc-1', nombre: 'Sucursal Principal' },
    { id: 'suc-2', nombre: 'Sucursal Norte' },
    { id: 'suc-3', nombre: 'Sucursal Sur' },
  ];

  // Inicializar distribución: todo el stock en la sucursal principal por defecto
  const [stockPorSucursal, setStockPorSucursal] = useState<{ sucursalId: string; nombreSucursal: string; unidades: number }[]>([
    { sucursalId: 'suc-1', nombreSucursal: 'Sucursal Principal', unidades: product.stock },
    { sucursalId: 'suc-2', nombreSucursal: 'Sucursal Norte', unidades: 0 },
    { sucursalId: 'suc-3', nombreSucursal: 'Sucursal Sur', unidades: 0 },
  ]);

  // Suma total de unidades en sucursales
  const sumaStockSucursales = stockPorSucursal.reduce((acc, curr) => acc + curr.unidades, 0);

  // Manejar registro de movimientos: solo traslados afectan la distribución por sucursal
  const handleRegistrarMovimiento = (movimientoDatos: any) => {
    if (
      movimientoDatos.tipoMovimiento === 'traslado' &&
      movimientoDatos.sucursalSalida &&
      movimientoDatos.sucursalEntrada &&
      movimientoDatos.cantidad > 0
    ) {
      setStockPorSucursal((prev) => {
        return prev.map((item) => {
          if (item.sucursalId === movimientoDatos.sucursalSalida) {
            return { ...item, unidades: Math.max(0, item.unidades - movimientoDatos.cantidad) };
          }
          if (item.sucursalId === movimientoDatos.sucursalEntrada) {
            return { ...item, unidades: item.unidades + movimientoDatos.cantidad };
          }
          return item;
        });
      });

      // Motivo automático para traslado
      const nombreSalida = sucursales.find(s => s.id === movimientoDatos.sucursalSalida)?.nombre || '';
      const nombreEntrada = sucursales.find(s => s.id === movimientoDatos.sucursalEntrada)?.nombre || '';
      const motivoTraslado = `Traslado de ${nombreSalida} a ${nombreEntrada}`;

      // En el Kardex: stockPrevio y stockResultante no cambian para traslados
      const kardexMovimiento = {
        ...movimientoDatos,
        motivo: motivoTraslado,
        stockPrevio: product.stock,
        stockResultante: product.stock,
      };
      if (onRegistrarMovimiento) {
        onRegistrarMovimiento(kardexMovimiento);
      }
      setMostrarRegistroMovimiento(false);
      return;
    }
    // Los demás movimientos (entrada, salida, ajuste) siguen igual
    if (onRegistrarMovimiento) {
      onRegistrarMovimiento(movimientoDatos);
    }
    setMostrarRegistroMovimiento(false);
  };


  // Función para determinar el color del texto según el nivel de stock
  const getStockTextColor = (stock: number): string => {
    if (stock > 10) return 'text-green-600';
    if (stock > 0) return 'text-amber-600';
    return 'text-red-600';
  };
  // Función para formatear precio en formato de moneda colombiana
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  };

  // Variables para información auxiliar
  // Asegurarse que cada variante tenga un id
  const variantes = (product.variantes || []).map((v, index) => ({
    ...v,
    id: v.id || `var-${product.id}-${index}`
  }));

  return (
    <div className="space-y-6">
      {/* Información principal */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">{product.nombre}</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-sm text-gray-500">SKU</p>
                <p className="font-medium text-gray-800">{product.sku}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Proveedor</p>
                <p className="font-medium text-gray-800">{product.proveedor?.nombre || ''}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Categoría</p>
                <p className="font-medium text-gray-800">{product.categoria}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Precio</p>
                <p className="font-medium text-gray-800">{formatCurrency(product.precio)}</p>
                {product.precios?.mayorista !== undefined && (
                  <p className="text-xs text-gray-600 mt-1">
                    <span className="font-semibold text-gray-700">Mayorista: </span>{formatCurrency(product.precios.mayorista)}
                  </p>
                )}
                {product.precios?.minorista !== undefined && (
                  <p className="text-xs text-gray-600 mt-1">
                    <span className="font-semibold text-gray-700">Minorista: </span>{formatCurrency(product.precios.minorista)}
                  </p>
                )}
              </div>
              {/* Distribución de stock por sucursal */}
              <div className="col-span-2">
                <p className="text-sm text-gray-500 mb-1">Distribución por sucursal</p>
                <table className="w-full text-xs border rounded mb-2">
                  <thead>
                    <tr>
                      <th className="text-left font-medium text-gray-700 px-2 py-1">Sucursal</th>
                      <th className="text-left font-medium text-gray-700 px-2 py-1">Unidades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Estado local para simular la distribución */}
                    {stockPorSucursal.map((item) => (
                      <tr key={item.sucursalId}>
                        <td className="px-2 py-1 text-gray-800">{item.nombreSucursal}</td>
                        <td className="px-2 py-1 text-gray-800">{item.unidades}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t">
                      <td className="px-2 py-1 font-semibold text-gray-900">Total</td>
                      <td className="px-2 py-1 font-semibold text-gray-900">{sumaStockSucursales} unidades</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div>
                <p className="text-sm text-gray-500">Stock Total</p>
                <p className={`font-medium ${getStockTextColor(product.stock)}`}>{product.stock} unidades</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Estado</p>
                <span
                  className={`px-2 py-1 text-xs rounded-full ${
                    product.estado === 'activo'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {product.estado === 'activo' ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Variantes</p>
                <p className="font-medium text-gray-800">{product.tieneVariantes ? 'Sí' : 'No'}</p>
              </div>
            </div>

            {/* Etiquetas del producto */}
            <div className="mt-4 mb-4">
              <p className="text-sm text-gray-500 mb-2">Etiquetas</p>
              <div className="flex flex-wrap gap-2">
                {product.etiquetas && product.etiquetas.length > 0 ? (
                  product.etiquetas.map((etiqueta: EtiquetaProducto) => (
                    <span
                      key={etiqueta.id}
                      className="inline-flex items-center px-2.5 py-1.5 rounded-full text-sm font-medium"
                      style={{ 
                        backgroundColor: etiqueta.color ? `${etiqueta.color}20` : '#E5E7EB',
                        color: etiqueta.color || '#1F2937',
                        borderWidth: '1px',
                        borderColor: etiqueta.color ? `${etiqueta.color}40` : '#D1D5DB'
                      }}
                    >
                      {etiqueta.nombre}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-gray-500 italic">No hay etiquetas asignadas</span>
                )}
              </div>
            </div>

            {/* Lotes y fechas de vencimiento */}
            {Array.isArray(product.lotes) && product.lotes.length > 0 && (
              <div className="bg-white border border-blue-100 rounded-lg p-4 mt-2">
                <h3 className="text-base font-semibold text-blue-800 mb-2">Lotes y fechas de vencimiento</h3>
                <table className="w-full text-xs mb-2">
                  <thead>
                    <tr className="bg-blue-50">
                      <th className="text-left font-medium text-blue-900 px-2 py-1">N° Lote</th>
                      <th className="text-left font-medium text-blue-900 px-2 py-1">Cantidad</th>
                      <th className="text-left font-medium text-blue-900 px-2 py-1">Vencimiento</th>
                      <th className="text-left font-medium text-blue-900 px-2 py-1">Observaciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.lotes.map((lote, idx) => (
                      <tr key={lote.id || idx} className="border-b last:border-b-0">
                        <td className="px-2 py-1 text-gray-800">{lote.numeroLote}</td>
                        <td className="px-2 py-1 text-gray-800">{lote.cantidad}</td>
                        <td className="px-2 py-1 text-gray-800">{lote.fechaVencimiento}</td>
                        <td className="px-2 py-1 text-gray-800">{lote.observaciones || <span className="text-gray-400 italic">-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Números de serie */}
            {Array.isArray(product.numerosSerie) && product.numerosSerie.length > 0 && (
              <div className="bg-white border border-indigo-100 rounded-lg p-4 mt-2">
                <h3 className="text-base font-semibold text-indigo-800 mb-2">Números de serie</h3>
                <table className="w-full text-xs mb-2">
                  <thead>
                    <tr className="bg-indigo-50">
                      <th className="text-left font-medium text-indigo-900 px-2 py-1">N° Serie</th>
                      <th className="text-left font-medium text-indigo-900 px-2 py-1">Observaciones</th>
                      <th className="text-left font-medium text-indigo-900 px-2 py-1">Vendido</th>
                      <th className="text-left font-medium text-indigo-900 px-2 py-1">Fecha de venta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.numerosSerie.map((serie, idx) => (
                      <tr key={serie.id || idx} className="border-b last:border-b-0">
                        <td className="px-2 py-1 text-gray-800">{serie.numeroSerie}</td>
                        <td className="px-2 py-1 text-gray-800">{serie.observaciones || <span className="text-gray-400 italic">-</span>}</td>
                        <td className="px-2 py-1 text-gray-800">{serie.vendido ? 'Sí' : 'No'}</td>
                        <td className="px-2 py-1 text-gray-800">{serie.fechaVenta || <span className="text-gray-400 italic">-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-indigo-700">Permite el seguimiento individual y el historial de ventas de cada artículo.</p>
              </div>
            )}

            <div className="border-t border-gray-200 pt-4">
              <h3 className="font-medium text-gray-800 mb-2">Descripción</h3>
              <p className="font-medium text-gray-800">{product.descripcion ?? 'Este producto no tiene descripción.'}</p>
            </div>
          </div>
          
          <div className="md:border-l md:border-gray-200 md:pl-6">
            <h3 className="font-medium text-gray-800 mb-3">Acciones</h3>
            <div className="space-y-3 mb-6">
              <button
                onClick={onEdit}
                className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50"
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-4 w-4 mr-2" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" 
                  />
                </svg>
                Editar producto
              </button>
              
              <button className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50">
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-4 w-4 mr-2" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" 
                  />
                </svg>
                Descargar códigos de barras
              </button>
              
              <button className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50">
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-4 w-4 mr-2" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" 
                  />
                </svg>
                Duplicar producto
              </button>
            </div>
            
            {/* Información de seguimiento con código de barras, QR y ubicación */}
            <div className="border-t border-gray-200 mt-5 pt-4">
              <h3 className="font-medium text-gray-800 mb-3">Información de seguimiento</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white border border-gray-200 rounded-md p-3 shadow-sm">
                  <p className="text-sm font-medium text-gray-700 mb-1">Código de barras</p>
                  <div className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                    </svg>
                    <p className="font-mono text-gray-800">
                      {product.codigoBarras || <span className="text-gray-500 italic">No asignado</span>}
                    </p>
                  </div>
                </div>
                
                <div className="bg-white border border-gray-200 rounded-md p-3 shadow-sm">
                  <p className="text-sm font-medium text-gray-700 mb-1">Código QR</p>
                  {product.codigoQR ? (
                    <>
                      {/* Si es una URL que parece ser una imagen, mostrarla */}
                      {product.codigoQR.match(/\.(jpeg|jpg|gif|png)$|^(http|https):\/\/.+/i) ? (
                        <div className="mt-2">
                          <div className="flex justify-between items-start mb-2">
                            <p className="text-xs text-gray-600 truncate pr-2 max-w-[70%]">{product.codigoQR}</p>
                            <a 
                              href={product.codigoQR} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Abrir
                            </a>
                          </div>
                          <div className="border border-gray-200 rounded-md p-2 bg-gray-50 flex justify-center items-center">
                            <img 
                              src={product.codigoQR} 
                              alt="Código QR" 
                              className="max-h-32 max-w-full object-contain" 
                              onError={(e) => {
                                // Si la imagen no carga, mostrar un mensaje de error
                                const target = e.target as HTMLImageElement;
                                target.onerror = null;
                                target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM5Y2EzYWYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTAgMTRhMy41IDMuNSAwIDAgMCA1IDBoMy41YTEgMSAwIDAgMCAuODI0LTEuNTggMTMgMTMgMCAwIDAtMTMuNTQ3LTIuODg3IDEyLjk4IDEyLjk4IDAgMCAwLTcuNTIgMTEuMzczbC41MTMuNTEzYTEgMSAwIDAgMCAxLjQxNSAwTDEwIDEyLjQxNFYxNHoiPjwvcGF0aD48bGluZSB4MT0iMjEiIHkxPSIzIiB4Mj0iMyIgeTI9IjIxIj48L2xpbmU+PC9zdmc+JyNyn';                                
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center mt-1">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                          </svg>
                          <p className="font-mono text-gray-800">{product.codigoQR}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center mt-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                      </svg>
                      <span className="text-gray-500 italic">No asignado</span>
                    </div>
                  )}
                </div>
                
                <div className="bg-white border border-gray-200 rounded-md p-3 shadow-sm">
                  <p className="text-sm font-medium text-gray-700 mb-1">Ubicación física</p>
                  <div className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="font-medium text-gray-800">{product.ubicacion || <span className="text-gray-500 italic">No asignada</span>}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Variantes del producto */}
      {product.tieneVariantes && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-800">Variantes del producto</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Nombre
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Valor
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    SKU
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Stock
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Precio
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {variantes.map((variante) => (
                  <tr key={variante.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-800">
                      {variante.nombre}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {variante.valor}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {variante.sku}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`font-medium ${getStockTextColor(variante.stock)}`}>
                        {variante.stock}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatCurrency(variante.precio)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* Historial de movimientos (Kardex) */}
      {mostrarRegistroMovimiento ? (
        <RegistrarMovimientoInventario 
          producto={product}
          onGuardar={handleRegistrarMovimiento}
          onCancelar={() => setMostrarRegistroMovimiento(false)}
        />
      ) : (
        <HistorialKardex 
          productoId={product.id}
          movimientos={movimientos}
          onRegistrarMovimiento={onRegistrarMovimiento ? 
            () => setMostrarRegistroMovimiento(true) : 
            undefined
          }
        />
      )}
    </div>
  );
};

export default DetalleProducto;
