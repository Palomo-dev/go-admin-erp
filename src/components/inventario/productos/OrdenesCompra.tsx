import React, { useState } from 'react';
import { OrdenCompra, Proveedor, Producto } from '@/types/products';

/**
 * Componente para listar y crear órdenes de compra.
 * No incluye integración con base de datos (solo estado local).
 * Documentación clara y uso de elementos HTML estándar.
 */

interface OrdenesCompraProps {
  productosDisponibles: Producto[];
  proveedores: Proveedor[];
  ordenesIniciales?: OrdenCompra[];
}

const OrdenesCompra: React.FC<OrdenesCompraProps> = ({ productosDisponibles, proveedores, ordenesIniciales = [] }) => {
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>(ordenesIniciales);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [form, setForm] = useState<Partial<OrdenCompra>>({
    proveedorId: '',
    productos: [],
    fecha: new Date().toISOString().slice(0, 10),
    estado: 'pendiente',
    total: 0,
    notas: '',
  });
  const [error, setError] = useState<string>('');

  // Manejo de productos en la orden
  const agregarProducto = (productoId: string) => {
    if (!productoId) return;
    const producto = productosDisponibles.find(p => p.id === productoId);
    if (!producto) return;
    if (form.productos?.some(p => p.productoId === productoId)) return;
    setForm({
      ...form,
      productos: [
        ...(form.productos || []),
        {
          productoId: producto.id,
          nombre: producto.nombre,
          cantidad: 1,
          precioUnitario: producto.precio,
          subtotal: producto.precio,
        },
      ],
    });
  };

  const actualizarCantidad = (productoId: string, cantidad: number) => {
    setForm({
      ...form,
      productos: (form.productos || []).map(p =>
        p.productoId === productoId ? { ...p, cantidad, subtotal: cantidad * p.precioUnitario } : p
      ),
    });
  };

  const eliminarProducto = (productoId: string) => {
    setForm({
      ...form,
      productos: (form.productos || []).filter(p => p.productoId !== productoId),
    });
  };

  const calcularTotal = () => {
    return (form.productos || []).reduce((acc, p) => acc + p.subtotal, 0);
  };

  const handleGuardar = () => {
    if (!form.proveedorId || !(form.productos && form.productos.length > 0)) {
      setError('Selecciona un proveedor y al menos un producto.');
      return;
    }
    const proveedor = proveedores.find(p => p.id === form.proveedorId);
    const nuevaOrden: OrdenCompra = {
      ...form,
      id: Math.random().toString(36).substring(2, 15),
      proveedorId: form.proveedorId!,
      proveedor,
      productos: form.productos!,
      fecha: form.fecha!,
      estado: form.estado as 'pendiente' | 'recibida' | 'cancelada',
      total: calcularTotal(),
      notas: form.notas || '',
    };
    setOrdenes([nuevaOrden, ...ordenes]);
    setForm({ proveedorId: '', productos: [], fecha: new Date().toISOString().slice(0, 10), estado: 'pendiente', total: 0, notas: '' });
    setMostrarFormulario(false);
    setError('');
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 mt-4">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Órdenes de compra</h2>
      <button
        type="button"
        className="mb-3 px-4 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-xs font-medium"
        onClick={() => setMostrarFormulario(!mostrarFormulario)}
      >
        {mostrarFormulario ? 'Cancelar' : 'Nueva orden de compra'}
      </button>
      {mostrarFormulario && (
        <div className="mb-6 border rounded p-4 bg-gray-50">
          <div className="mb-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Proveedor</label>
            <select
              className="border px-2 py-1 rounded text-xs text-gray-800 w-full"
              value={form.proveedorId}
              onChange={e => setForm({ ...form, proveedorId: e.target.value })}
            >
              <option value="">Selecciona proveedor</option>
              {proveedores.map(prov => (
                <option key={prov.id} value={prov.id}>{prov.nombre}</option>
              ))}
            </select>
          </div>
          <div className="mb-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Productos</label>
            <select
              className="border px-2 py-1 rounded text-xs text-gray-800 w-full"
              onChange={e => agregarProducto(e.target.value)}
              value=""
            >
              <option value="">Añadir producto…</option>
              {productosDisponibles.filter(p => !(form.productos || []).some(fp => fp.productoId === p.id)).map(prod => (
                <option key={prod.id} value={prod.id}>{prod.nombre}</option>
              ))}
            </select>
            {(form.productos || []).length > 0 && (
              <table className="w-full mt-2 text-xs">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left px-2 py-1 font-semibold text-gray-800">Producto</th>
                    <th className="text-left px-2 py-1 font-semibold text-gray-800">Cantidad</th>
                    <th className="text-left px-2 py-1 font-semibold text-gray-800">Precio unitario</th>
                    <th className="text-left px-2 py-1 font-semibold text-gray-800">Subtotal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {form.productos!.map(prod => (
                    <tr key={prod.productoId}>
                      <td className="px-2 py-1 text-gray-800">{prod.nombre}</td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          min={1}
                          className="w-16 border rounded px-1 py-0.5 text-xs text-gray-800"
                          value={prod.cantidad === undefined || isNaN(Number(prod.cantidad)) ? '' : prod.cantidad}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '' || isNaN(Number(val))) {
                              actualizarCantidad(prod.productoId, undefined as unknown as number);
                            } else {
                              actualizarCantidad(prod.productoId, Math.max(1, Number(val)));
                            }
                          }}
                          onFocus={e => {
                            if (prod.cantidad === 1) actualizarCantidad(prod.productoId, undefined as unknown as number);
                          }}
                          onBlur={e => {
                            if (e.target.value === '' || isNaN(Number(e.target.value))) {
                              actualizarCantidad(prod.productoId, 1);
                            }
                          }}
                        />
                      </td>
                      <td className="px-2 py-1 text-gray-800">${prod.precioUnitario.toFixed(2)}</td>
                      <td className="px-2 py-1 text-gray-800">${(typeof prod.subtotal === 'number' && !isNaN(prod.subtotal) ? prod.subtotal : 0).toFixed(2)}</td>
                      <td>
                        <button
                          type="button"
                          className="text-xs text-red-600 hover:text-red-800 px-2 py-0.5 rounded"
                          onClick={() => eliminarProducto(prod.productoId)}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="mb-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              className="w-full border rounded px-2 py-1 text-xs text-gray-800"
              value={form.notas}
              onChange={e => setForm({ ...form, notas: e.target.value })}
              rows={2}
            />
          </div>
          <div className="mb-2 flex justify-between items-center">
            <span className="text-xs font-medium text-gray-700">Total: <span className="text-gray-900">${(typeof calcularTotal() === 'number' && !isNaN(calcularTotal()) ? calcularTotal() : 0).toFixed(2)}</span></span>
            <button
              type="button"
              className="px-3 py-1 bg-green-100 text-green-700 rounded text-xs font-medium hover:bg-green-200"
              onClick={handleGuardar}
            >
              Guardar orden
            </button>
          </div>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
      )}
      {/* Listado de órdenes */}
      {ordenes.length === 0 ? (
        <p className="text-xs text-gray-500">No hay órdenes de compra registradas.</p>
      ) : (
        <table className="w-full text-xs mt-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left px-2 py-1 font-semibold text-gray-800">Fecha</th>
              <th className="text-left px-2 py-1 font-semibold text-gray-800">Proveedor</th>
              <th className="text-left px-2 py-1 font-semibold text-gray-800">Estado</th>
              <th className="text-left px-2 py-1 font-semibold text-gray-800">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ordenes.map(orden => (
              <tr key={orden.id} className="border-b last:border-b-0">
                <td className="px-2 py-1 text-gray-800">{orden.fecha}</td>
                <td className="px-2 py-1 text-gray-800">{orden.proveedor?.nombre || orden.proveedorId}</td>
                <td className="px-2 py-1 text-gray-800">{orden.estado}</td>
                <td className="px-2 py-1 text-gray-800">${orden.total.toFixed(2)}</td>
                <td>
                  {/* Aquí se podría agregar botón para ver detalle o cambiar estado */}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default OrdenesCompra;
