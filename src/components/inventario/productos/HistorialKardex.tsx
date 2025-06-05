"use client";

import React, { useState } from 'react';
import { MovimientoInventario, TipoMovimientoInventario } from './types';

interface HistorialKardexProps {
  productoId?: string;
  movimientos: MovimientoInventario[];
  onRegistrarMovimiento?: () => void;
}

/**
 * Componente para mostrar el historial de movimientos de inventario (Kardex)
 * 
 * Muestra una tabla con todos los movimientos de stock para un producto específico
 * o para todos los productos, permitiendo filtrar por tipo de movimiento y fechas.
 */
const HistorialKardex: React.FC<HistorialKardexProps> = ({
  productoId,
  movimientos,
  onRegistrarMovimiento,
}) => {
  // Estados para filtros
  const [filtroFechaInicio, setFiltroFechaInicio] = useState<string>('');
  const [filtroFechaFin, setFiltroFechaFin] = useState<string>('');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');

  // Formatear fecha para mostrar en la tabla
  const formatearFecha = (fecha: Date): string => {
    return new Date(fecha).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Obtener clase CSS según el tipo de movimiento
  const getTipoMovimientoClass = (tipo: TipoMovimientoInventario): string => {
    switch (tipo) {
      case TipoMovimientoInventario.ENTRADA:
        return 'bg-green-100 text-green-800';
      case TipoMovimientoInventario.SALIDA:
        return 'bg-blue-100 text-blue-800';
      case TipoMovimientoInventario.AJUSTE:
        return 'bg-yellow-100 text-yellow-800';
      case TipoMovimientoInventario.TRASLADO:
        return 'bg-purple-100 text-purple-800';
      case TipoMovimientoInventario.MERMA:
        return 'bg-red-100 text-red-800';
      case TipoMovimientoInventario.INVENTARIO:
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Filtrar movimientos según criterios
  const movimientosFiltrados = movimientos.filter(movimiento => {
    // Filtrar por producto si se especifica
    if (productoId && movimiento.productoId !== productoId) {
      return false;
    }

    // Filtrar por tipo de movimiento
    if (filtroTipo !== 'todos' && movimiento.tipoMovimiento !== filtroTipo) {
      return false;
    }

    // Filtrar por fecha de inicio
    if (filtroFechaInicio && new Date(movimiento.fecha) < new Date(filtroFechaInicio)) {
      return false;
    }

    // Filtrar por fecha fin
    if (filtroFechaFin && new Date(movimiento.fecha) > new Date(filtroFechaFin)) {
      return false;
    }

    return true;
  }).sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-lg font-medium text-gray-800">Historial de Movimientos (Kardex)</h2>
        
        {onRegistrarMovimiento && (
          <button
            onClick={onRegistrarMovimiento}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
          >
            Registrar Movimiento
          </button>
        )}
      </div>

      {/* Filtros de fecha y tipo */}
      <div className="p-4 bg-gray-50 border-b border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label htmlFor="filtroTipo" className="block text-sm font-medium text-gray-700 mb-1">
            Tipo de Movimiento
          </label>
          <select
            id="filtroTipo"
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="block w-full py-2 px-3 border border-gray-300 rounded-md bg-white text-gray-800"
          >
            <option value="todos">Todos los tipos</option>
            {Object.values(TipoMovimientoInventario).map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo.charAt(0).toUpperCase() + tipo.slice(1)}
              </option>
            ))}
          </select>
        </div>
        
        <div>
          <label htmlFor="fechaInicio" className="block text-sm font-medium text-gray-700 mb-1">
            Fecha Inicio
          </label>
          <input
            type="date"
            id="fechaInicio"
            value={filtroFechaInicio}
            onChange={(e) => setFiltroFechaInicio(e.target.value)}
            className="block w-full py-2 px-3 border border-gray-300 rounded-md bg-white text-gray-800"
          />
        </div>
        
        <div>
          <label htmlFor="fechaFin" className="block text-sm font-medium text-gray-700 mb-1">
            Fecha Fin
          </label>
          <input
            type="date"
            id="fechaFin"
            value={filtroFechaFin}
            onChange={(e) => setFiltroFechaFin(e.target.value)}
            className="block w-full py-2 px-3 border border-gray-300 rounded-md bg-white text-gray-800"
          />
        </div>

        <div className="flex items-end">
          <button
            onClick={() => {
              setFiltroFechaInicio('');
              setFiltroFechaFin('');
              setFiltroTipo('todos');
            }}
            className="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded-md text-sm hover:bg-gray-50"
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {/* Tabla de movimientos */}
      {movimientosFiltrados.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-gray-500">No se encontraron movimientos con los filtros seleccionados.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Fecha
                </th>
                {!productoId && (
                  <>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Producto
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      SKU
                    </th>
                  </>
                )}
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Tipo
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Cantidad
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Stock Previo
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Stock Resultante
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Motivo
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Responsable
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {movimientosFiltrados.map((movimiento) => (
                <tr key={movimiento.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {formatearFecha(movimiento.fecha)}
                  </td>
                  {!productoId && (
                    <>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-800">{movimiento.productoNombre}</div>
                        {movimiento.varianteId && (
                          <div className="text-xs text-gray-500">Variante ID: {movimiento.varianteId}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {movimiento.productoSku}
                      </td>
                    </>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTipoMovimientoClass(movimiento.tipoMovimiento)}`}>
                      {movimiento.tipoMovimiento}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <span className={movimiento.cantidad > 0 ? 'text-green-600' : 'text-red-600'}>
                      {movimiento.cantidad > 0 ? '+' : ''}{movimiento.cantidad}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {movimiento.stockPrevio}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {movimiento.stockResultante}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    <div className="max-w-xs truncate" title={movimiento.motivo}>
                      {movimiento.motivo}
                    </div>
                    {movimiento.documentoReferencia && (
                      <div className="text-xs text-gray-500 mt-1">
                        Ref: {movimiento.documentoReferencia}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {movimiento.responsable}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default HistorialKardex;
