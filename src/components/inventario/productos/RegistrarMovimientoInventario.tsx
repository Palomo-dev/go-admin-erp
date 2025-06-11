"use client";

import React, { useState } from 'react';
import { TipoMovimientoInventario, MovimientoInventario, Producto } from '@/types/products';

interface RegistrarMovimientoInventarioProps {
  producto?: Producto;
  onGuardar: (movimiento: Omit<MovimientoInventario, 'id'>) => void;
  onCancelar: () => void;
}

/**
 * Componente para registrar un nuevo movimiento de inventario (Kardex)
 * 
 * Permite crear entradas, salidas y ajustes de inventario con toda
 * la información necesaria para mantener una trazabilidad precisa.
 */
const RegistrarMovimientoInventario: React.FC<RegistrarMovimientoInventarioProps> = ({
  producto,
  onGuardar,
  onCancelar,
}) => {
  // Sucursales de ejemplo (en producción vendrán de la BD)
  const sucursales = [
    { id: 'suc-1', nombre: 'Sucursal Principal' },
    { id: 'suc-2', nombre: 'Sucursal Norte' },
    { id: 'suc-3', nombre: 'Sucursal Sur' },
  ];

  const [formData, setFormData] = useState<Omit<MovimientoInventario, 'id'> & { sucursalSalida?: string; sucursalEntrada?: string }>({
    fecha: new Date(),
    productoId: producto?.id || '',
    productoNombre: producto?.nombre || '',
    productoSku: producto?.sku || '',
    tipoMovimiento: TipoMovimientoInventario.ENTRADA,
    cantidad: 1,
    stockPrevio: producto?.stock || 0,
    stockResultante: (producto?.stock || 0) + 1, // Por defecto sumamos 1 para entrada
    motivo: '',
    responsable: 'Admin', // Debería venir del contexto de usuario
    sucursalSalida: '',
    sucursalEntrada: '',
  });

  const [formError, setFormError] = useState<string>('');

  // Manejar cambios en campos del formulario
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    // Campos especiales para traslado
    if (name === 'sucursalSalida' || name === 'sucursalEntrada') {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
      return;
    }

    // Caso especial: al cambiar tipo o cantidad, recalculamos el stock resultante
    if (name === 'tipoMovimiento' || name === 'cantidad') {
      let cantidad = name === 'cantidad' 
        ? parseInt(value, 10) || 0
        : formData.cantidad;
      
      // Determinamos si sumamos o restamos según el tipo de movimiento
      let calculoCantidad = cantidad;
      if (name === 'tipoMovimiento') {
        const nuevoTipo = value as TipoMovimientoInventario;
        if (nuevoTipo === TipoMovimientoInventario.SALIDA || nuevoTipo === TipoMovimientoInventario.MERMA) {
          calculoCantidad = Math.abs(calculoCantidad) * -1; // Forzamos valor negativo
        } else if (nuevoTipo === TipoMovimientoInventario.ENTRADA) {
          calculoCantidad = Math.abs(calculoCantidad); // Forzamos valor positivo
        }
      } else if (formData.tipoMovimiento === TipoMovimientoInventario.SALIDA || 
                formData.tipoMovimiento === TipoMovimientoInventario.MERMA) {
        calculoCantidad = Math.abs(calculoCantidad) * -1; // Forzamos valor negativo
      }

      // Calcular el nuevo stock resultante
      const stockResultante = formData.stockPrevio + calculoCantidad;

      setFormData(prev => ({
        ...prev,
        [name]: value,
        cantidad: name === 'cantidad' ? parseInt(value, 10) || 0 : calculoCantidad,
        stockResultante: stockResultante
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  // Manejar el envío del formulario
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validar campos requeridos
    if (!formData.productoId || !formData.motivo || !formData.responsable) {
      setFormError('Por favor completa todos los campos obligatorios.');
      return;
    }

    // Validar cantidad según tipo de movimiento
    if (formData.tipoMovimiento === TipoMovimientoInventario.SALIDA && 
        formData.stockResultante < 0) {
      setFormError('No hay suficiente stock disponible para esta salida.');
      return;
    }

    // Todo correcto, enviar el movimiento
    onGuardar(formData);
  };

  // Obtener la clase de estilo según el tipo de movimiento (para previsualización)
  const getTipoMovimientoClass = (): string => {
    switch (formData.tipoMovimiento) {
      case TipoMovimientoInventario.ENTRADA:
        return 'bg-green-100 text-green-800 border-green-200';
      case TipoMovimientoInventario.SALIDA:
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case TipoMovimientoInventario.AJUSTE:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case TipoMovimientoInventario.TRASLADO:
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case TipoMovimientoInventario.MERMA:
        return 'bg-red-100 text-red-800 border-red-200';
      case TipoMovimientoInventario.INVENTARIO:
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-medium text-gray-800">Registrar Movimiento de Inventario</h2>
      </div>

      <form onSubmit={handleSubmit} className="p-6">
        {formError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{formError}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Información del producto */}
          <div className="border rounded-md p-4 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Información del Producto</h3>
            
            {producto ? (
              <div>
                <p className="text-sm font-medium text-gray-800">{producto.nombre}</p>
                <p className="text-sm text-gray-600">SKU: {producto.sku}</p>
                <p className="text-sm text-gray-600">Stock actual: {producto.stock}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label htmlFor="productoId" className="block text-sm font-medium text-gray-700 mb-1">
                    ID del Producto*
                  </label>
                  <input
                    type="text"
                    id="productoId"
                    name="productoId"
                    value={formData.productoId}
                    onChange={handleChange}
                    required
                    className="block w-full py-2 px-3 border border-gray-300 rounded-md bg-white text-gray-800"
                  />
                </div>
                
                <div>
                  <label htmlFor="productoNombre" className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre del Producto*
                  </label>
                  <input
                    type="text"
                    id="productoNombre"
                    name="productoNombre"
                    value={formData.productoNombre}
                    onChange={handleChange}
                    required
                    className="block w-full py-2 px-3 border border-gray-300 rounded-md bg-white text-gray-800"
                  />
                </div>
                
                <div>
                  <label htmlFor="productoSku" className="block text-sm font-medium text-gray-700 mb-1">
                    SKU del Producto*
                  </label>
                  <input
                    type="text"
                    id="productoSku"
                    name="productoSku"
                    value={formData.productoSku}
                    onChange={handleChange}
                    required
                    className="block w-full py-2 px-3 border border-gray-300 rounded-md bg-white text-gray-800"
                  />
                </div>
                
                <div>
                  <label htmlFor="stockPrevio" className="block text-sm font-medium text-gray-700 mb-1">
                    Stock Actual*
                  </label>
                  <input
                    type="number"
                    id="stockPrevio"
                    name="stockPrevio"
                    value={formData.stockPrevio}
                    onChange={handleChange}
                    required
                    min="0"
                    className="block w-full py-2 px-3 border border-gray-300 rounded-md bg-white text-gray-800"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Detalles del movimiento */}
          <div className="border rounded-md p-4 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Detalles del Movimiento</h3>
            
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label htmlFor="fecha" className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha*
                </label>
                <input
                  type="datetime-local"
                  id="fecha"
                  name="fecha"
                  value={formData.fecha instanceof Date ? formData.fecha.toISOString().slice(0, 16) : formData.fecha}
                  onChange={handleChange}
                  required
                  className="block w-full py-2 px-3 border border-gray-300 rounded-md bg-white text-gray-800"
                />
              </div>
              
              <div>
                <label htmlFor="tipoMovimiento" className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Movimiento*
                </label>
                <select
                  id="tipoMovimiento"
                  name="tipoMovimiento"
                  value={formData.tipoMovimiento}
                  onChange={handleChange}
                  required
                  className="block w-full py-2 px-3 border border-gray-300 rounded-md bg-white text-gray-800"
                >
                  {Object.values(TipoMovimientoInventario).map(tipo => (
                    <option key={tipo} value={tipo}>
                      {tipo.charAt(0).toUpperCase() + tipo.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label htmlFor="cantidad" className="block text-sm font-medium text-gray-700 mb-1">
                  Cantidad*
                </label>
                <input
                  type="number"
                  id="cantidad"
                  name="cantidad"
                  value={Math.abs(formData.cantidad)}
                  onChange={handleChange}
                  required
                  min="1"
                  className="block w-full py-2 px-3 border border-gray-300 rounded-md bg-white text-gray-800"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formData.tipoMovimiento === TipoMovimientoInventario.SALIDA || 
                   formData.tipoMovimiento === TipoMovimientoInventario.MERMA 
                    ? 'Se restará del inventario'
                    : formData.tipoMovimiento === TipoMovimientoInventario.ENTRADA 
                      ? 'Se sumará al inventario'
                      : 'Se ajustará el inventario'}
                </p>
              </div>

              <div>
                <label htmlFor="responsable" className="block text-sm font-medium text-gray-700 mb-1">
                  Responsable*
                </label>
                <input
                  type="text"
                  id="responsable"
                  name="responsable"
                  value={formData.responsable}
                  onChange={handleChange}
                  required
                  className="block w-full py-2 px-3 border border-gray-300 rounded-md bg-white text-gray-800"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Información adicional */}
        <div className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="motivo" className="block text-sm font-medium text-gray-700 mb-1">
                Motivo / Descripción*
              </label>
              <textarea
                id="motivo"
                name="motivo"
                value={formData.motivo}
                onChange={handleChange}
                required
                rows={3}
                className="block w-full py-2 px-3 border border-gray-300 rounded-md bg-white text-gray-800"
                placeholder="Describe el motivo del movimiento..."
              />
            </div>

            <div>
              <label htmlFor="documentoReferencia" className="block text-sm font-medium text-gray-700 mb-1">
                Documento de Referencia
              </label>
              <input
                type="text"
                id="documentoReferencia"
                name="documentoReferencia"
                value={formData.documentoReferencia || ''}
                onChange={handleChange}
                className="block w-full py-2 px-3 border border-gray-300 rounded-md bg-white text-gray-800"
                placeholder="Número de factura, orden, etc."
              />

              {/* Campos de sucursal solo si es traslado */}
              {formData.tipoMovimiento === TipoMovimientoInventario.TRASLADO && (
                <div className="mt-4 grid grid-cols-1 gap-4">
                  <div>
                    <label htmlFor="sucursalSalida" className="block text-sm font-medium text-gray-700 mb-1">
                      Sucursal de salida
                    </label>
                    <select
                      id="sucursalSalida"
                      name="sucursalSalida"
                      value={formData.sucursalSalida || ''}
                      onChange={handleChange}
                      className="block w-full py-2 px-3 border border-gray-300 rounded-md bg-white text-gray-800"
                    >
                      <option value="">Selecciona sucursal</option>
                      {sucursales.map((suc) => (
                        <option key={suc.id} value={suc.id}>{suc.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="sucursalEntrada" className="block text-sm font-medium text-gray-700 mb-1">
                      Sucursal de entrada
                    </label>
                    <select
                      id="sucursalEntrada"
                      name="sucursalEntrada"
                      value={formData.sucursalEntrada || ''}
                      onChange={handleChange}
                      className="block w-full py-2 px-3 border border-gray-300 rounded-md bg-white text-gray-800"
                    >
                      <option value="">Selecciona sucursal</option>
                      {sucursales.map((suc) => (
                        <option key={suc.id} value={suc.id}>{suc.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="mt-4">
                <label htmlFor="ubicacion" className="block text-sm font-medium text-gray-700 mb-1">
                  Ubicación
                </label>
                <input
                  type="text"
                  id="ubicacion"
                  name="ubicacion"
                  value={formData.ubicacion || ''}
                  onChange={handleChange}
                  className="block w-full py-2 px-3 border border-gray-300 rounded-md bg-white text-gray-800"
                  placeholder="Ubicación física del producto"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Preview del cambio de stock o traslado */}
        <div className={`mb-6 p-4 border rounded-md ${getTipoMovimientoClass()}`}>
          <h3 className="text-sm font-semibold mb-2">Previsualización del Cambio</h3>
          {formData.tipoMovimiento === TipoMovimientoInventario.TRASLADO ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-gray-600">Sucursal de salida</p>
                <p className="text-lg font-semibold">
                  {sucursales.find(s => s.id === formData.sucursalSalida)?.nombre || '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Cantidad</p>
                <p className="text-lg font-semibold text-purple-700">
                  {formData.cantidad}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Sucursal de entrada</p>
                <p className="text-lg font-semibold">
                  {sucursales.find(s => s.id === formData.sucursalEntrada)?.nombre || '-'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-gray-600">Stock Anterior</p>
                <p className="text-lg font-semibold">{formData.stockPrevio}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Cambio</p>
                <p className={`text-lg font-semibold ${formData.cantidad >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formData.cantidad > 0 ? '+' : ''}{formData.cantidad}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Stock Resultante</p>
                <p className="text-lg font-semibold">{formData.stockResultante}</p>
              </div>
            </div>
          )}
        </div>

        {/* Botones de acción */}
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancelar}
            className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Registrar Movimiento
          </button>
        </div>
      </form>
    </div>
  );
};

export default RegistrarMovimientoInventario;
