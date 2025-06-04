"use client";

import React from 'react';
import { Producto } from '@/components/inventario/productos/types';

interface DetalleProductoProps {
  product: Producto;
  onEdit: () => void;
}

/**
 * Componente para mostrar el detalle de un producto
 * 
 * Muestra información detallada del producto seleccionado
 * junto con sus variantes y datos complementarios
 */
const DetalleProducto: React.FC<DetalleProductoProps> = ({ product, onEdit }) => {
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

  // Variantes de ejemplo (en producción vendrían de Supabase)
  const variantes = [
    { id: '1', nombre: 'S / Rojo', sku: `${product.sku}-S-R`, stock: 10, precio: product.precio },
    { id: '2', nombre: 'M / Rojo', sku: `${product.sku}-M-R`, stock: 15, precio: product.precio },
    { id: '3', nombre: 'L / Rojo', sku: `${product.sku}-L-R`, stock: 5, precio: product.precio },
    { id: '4', nombre: 'S / Azul', sku: `${product.sku}-S-A`, stock: 8, precio: product.precio },
    { id: '5', nombre: 'M / Azul', sku: `${product.sku}-M-A`, stock: 12, precio: product.precio },
  ];

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
                <p className="text-sm text-gray-500">Categoría</p>
                <p className="font-medium text-gray-800">{product.categoria}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Precio</p>
                <p className="font-medium text-gray-800">{formatCurrency(product.precio)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Stock Total</p>
                <p className={`font-medium ${getStockTextColor(product.stock)}`}>
                  {product.stock} unidades
                </p>
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
            
            <div className="border-t border-gray-200 pt-4">
              <h3 className="font-medium text-gray-800 mb-2">Descripción</h3>
              <p className="font-medium text-gray-800">{product.descripcion ?? 'Este producto no tiene descripción.'}</p>
            </div>
          </div>
          
          <div className="md:border-l md:border-gray-200 md:pl-6">
            <h3 className="font-medium text-gray-800 mb-3">Acciones</h3>
            <div className="space-y-3">
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
      
      {/* Historial de movimientos */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="text-lg font-medium text-gray-800 mb-4">Historial de movimientos</h2>
        <div className="text-sm text-gray-500 text-center py-4">
          Funcionalidad pendiente de implementación
        </div>
      </div>
    </div>
  );
};

export default DetalleProducto;
