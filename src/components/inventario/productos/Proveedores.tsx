import React, { useState, useEffect } from 'react';
import { Proveedor } from './types';

/**
 * Componente para listar y crear proveedores.
 * No incluye integración con base de datos (solo estado local).
 * Documentación clara y uso de elementos HTML estándar.
 */

interface ProveedoresProps {
  proveedoresIniciales?: Proveedor[];
  onProveedoresChange?: (proveedores: Proveedor[]) => void;
}

const Proveedores: React.FC<ProveedoresProps> = ({ proveedoresIniciales = [], onProveedoresChange }) => {
  const [proveedores, setProveedores] = useState<Proveedor[]>(proveedoresIniciales);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [form, setForm] = useState<Partial<Proveedor>>({ nombre: '' });
  const [error, setError] = useState<string>('');
  const [editandoIdx, setEditandoIdx] = useState<number | null>(null);
  const [confirmarEliminarIdx, setConfirmarEliminarIdx] = useState<number | null>(null);

  // Sincronizar estado local con el prop si cambia desde fuera
  useEffect(() => {
    setProveedores(proveedoresIniciales);
  }, [proveedoresIniciales]);

  // Guardar nuevo proveedor o edición
  const handleGuardar = () => {
    // Validaciones obligatorias
    if (!form.nombre || !form.nombre.trim()) {
      setError('El nombre del proveedor es obligatorio.');
      return;
    }
    if (!form.contacto || !form.contacto.trim()) {
      setError('El nombre de contacto es obligatorio.');
      return;
    }
    if (!form.telefono || !form.telefono.trim()) {
      setError('El teléfono/celular es obligatorio.');
      return;
    }
    if (!/^[0-9]+$/.test(form.telefono.trim())) {
      setError('El teléfono/celular debe ser numérico.');
      return;
    }
    if (!form.email || !form.email.trim()) {
      setError('El email es obligatorio.');
      return;
    }
    // Validación básica de email
    if (!/^([a-zA-Z0-9_\-.+]+)@([a-zA-Z0-9_\-.]+)\.([a-zA-Z]{2,})$/.test(form.email.trim())) {
      setError('El email no tiene un formato válido.');
      return;
    }
    if (!form.direccion || !form.direccion.trim()) {
      setError('La dirección es obligatoria.');
      return;
    }

    if (editandoIdx === null) {
      const nuevos = [
        {
          ...form,
          id: Math.random().toString(36).substring(2, 15),
          nombre: form.nombre.trim(),
        } as Proveedor,
        ...proveedores,
      ];
      setProveedores(nuevos);
      onProveedoresChange?.(nuevos);
    } else {
      const actualizados = proveedores.map((prov, idx) => idx === editandoIdx ? { ...prov, ...form, nombre: form.nombre!.trim() } : prov);
      setProveedores(actualizados);
      onProveedoresChange?.(actualizados);
      setEditandoIdx(null);
    }
    setForm({ nombre: '' });
    setMostrarFormulario(false);
    setError('');
  };

  // Iniciar edición
  const handleEditar = (idx: number) => {
    setForm({ ...proveedores[idx] });
    setEditandoIdx(idx);
    setMostrarFormulario(true);
    setError('');
  };

  // Confirmar y eliminar proveedor
  const handleEliminar = (idx: number) => {
    const nuevos = proveedores.filter((_, i) => i !== idx);
    setProveedores(nuevos);
    onProveedoresChange?.(nuevos);
    setConfirmarEliminarIdx(null);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 mt-4">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Proveedores</h2>
      <button
        type="button"
        className="mb-3 px-4 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-xs font-medium"
        onClick={() => {
          setMostrarFormulario(!mostrarFormulario);
          setForm({ nombre: '' });
          setEditandoIdx(null);
          setError('');
        }}
      >
        {mostrarFormulario ? 'Cancelar' : 'Nuevo proveedor'}
      </button>
      {mostrarFormulario && (
        <div className="mb-6 border rounded p-4 bg-gray-50">
          <div className="mb-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
            <div className="relative flex items-center">
              <input
                type="text"
                className={`w-full border rounded px-2 py-1 text-xs text-gray-800 ${error?.toLowerCase().includes('nombre del proveedor') ? 'border-red-500 bg-red-50 pr-8' : ''}`}
                value={form.nombre || ''}
                onChange={e => setForm({ ...form, nombre: e.target.value })}
                placeholder="Nombre comercial"
              />
              {error?.toLowerCase().includes('nombre del proveedor') && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-red-500" aria-label="error">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.054 0 1.658-1.14 1.105-2.045L13.105 4.045c-.553-.905-1.657-.905-2.21 0L3.977 16.955c-.553.905.051 2.045 1.105 2.045z" /></svg>
                </span>
              )}
            </div>
          </div>
          <div className="mb-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Contacto</label>
            <div className="relative flex items-center">
              <input
                type="text"
                className={`w-full border rounded px-2 py-1 text-xs text-gray-800 ${error?.toLowerCase().includes('contacto') ? 'border-red-500 bg-red-50 pr-8' : ''}`}
                value={form.contacto || ''}
                onChange={e => setForm({ ...form, contacto: e.target.value })}
                placeholder="Nombre de contacto"
              />
              {error?.toLowerCase().includes('contacto') && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-red-500" aria-label="error">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.054 0 1.658-1.14 1.105-2.045L13.105 4.045c-.553-.905-1.657-.905-2.21 0L3.977 16.955c-.553.905.051 2.045 1.105 2.045z" /></svg>
                </span>
              )}
            </div>
          </div>
          <div className="mb-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Teléfono</label>
            <div className="relative flex items-center">
              <input
                type="text"
                className={`w-full border rounded px-2 py-1 text-xs text-gray-800 ${error?.toLowerCase().includes('teléfono') || error?.toLowerCase().includes('celular') ? 'border-red-500 bg-red-50 pr-8' : ''}`}
                value={form.telefono || ''}
                onChange={e => setForm({ ...form, telefono: e.target.value })}
                placeholder="Teléfono"
              />
              {(error?.toLowerCase().includes('teléfono') || error?.toLowerCase().includes('celular')) && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-red-500" aria-label="error">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.054 0 1.658-1.14 1.105-2.045L13.105 4.045c-.553-.905-1.657-.905-2.21 0L3.977 16.955c-.553.905.051 2.045 1.105 2.045z" /></svg>
                </span>
              )}
            </div>
          </div>
          <div className="mb-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <div className="relative flex items-center">
              <input
                type="email"
                className={`w-full border rounded px-2 py-1 text-xs text-gray-800 ${error?.toLowerCase().includes('email') ? 'border-red-500 bg-red-50 pr-8' : ''}`}
                value={form.email || ''}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="Email"
              />
              {error?.toLowerCase().includes('email') && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-red-500" aria-label="error">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.054 0 1.658-1.14 1.105-2.045L13.105 4.045c-.553-.905-1.657-.905-2.21 0L3.977 16.955c-.553.905.051 2.045 1.105 2.045z" /></svg>
                </span>
              )}
            </div>
          </div>
          <div className="mb-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Dirección</label>
            <div className="relative flex items-center">
              <input
                type="text"
                className={`w-full border rounded px-2 py-1 text-xs text-gray-800 ${error?.toLowerCase().includes('dirección') ? 'border-red-500 bg-red-50 pr-8' : ''}`}
                value={form.direccion || ''}
                onChange={e => setForm({ ...form, direccion: e.target.value })}
                placeholder="Dirección"
              />
              {error?.toLowerCase().includes('dirección') && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-red-500" aria-label="error">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.054 0 1.658-1.14 1.105-2.045L13.105 4.045c-.553-.905-1.657-.905-2.21 0L3.977 16.955c-.553.905.051 2.045 1.105 2.045z" /></svg>
                </span>
              )}
            </div>
          </div>
          <div className="mb-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              className="w-full border rounded px-2 py-1 text-xs text-gray-800"
              value={form.notas || ''}
              onChange={e => setForm({ ...form, notas: e.target.value })}
              rows={2}
              placeholder="Notas adicionales (opcional)"
            />
          </div>
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              className="px-3 py-1 bg-green-100 text-green-700 rounded text-xs font-medium hover:bg-green-200"
              onClick={handleGuardar}
            >
              {editandoIdx === null ? 'Guardar proveedor' : 'Actualizar proveedor'}
            </button>
          </div>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
      )}
      {/* Listado de proveedores */}
      {proveedores.length === 0 ? (
        <p className="text-xs text-gray-500">No hay proveedores registrados.</p>
      ) : (
        <table className="w-full text-xs mt-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left px-2 py-1 font-semibold text-gray-800">Nombre</th>
              <th className="text-left px-2 py-1 font-semibold text-gray-800">Contacto</th>
              <th className="text-left px-2 py-1 font-semibold text-gray-800">Teléfono</th>
              <th className="text-left px-2 py-1 font-semibold text-gray-800">Email</th>
              <th className="text-left px-2 py-1 font-semibold text-gray-800">Dirección</th>
              <th className="text-left px-2 py-1 font-semibold text-gray-800">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {proveedores.map((prov, idx) => (
              <tr key={prov.id} className="border-b last:border-b-0">
                <td className="px-2 py-1 text-gray-800">{prov.nombre}</td>
                <td className="px-2 py-1 text-gray-800">{prov.contacto || '-'}</td>
                <td className="px-2 py-1 text-gray-800">{prov.telefono || '-'}</td>
                <td className="px-2 py-1 text-gray-800">{prov.email || '-'}</td>
                <td className="px-2 py-1 text-gray-800">{prov.direccion || '-'}</td>
                <td className="px-2 py-1 flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-blue-600 hover:text-blue-800 px-2 py-0.5 rounded"
                    onClick={() => handleEditar(idx)}
                  >
                    Editar
                  </button>
                  {confirmarEliminarIdx === idx ? (
                    <>
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:text-red-800 px-2 py-0.5 rounded"
                        onClick={() => handleEliminar(idx)}
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        className="text-xs text-gray-600 hover:text-gray-800 px-2 py-0.5 rounded"
                        onClick={() => setConfirmarEliminarIdx(null)}
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:text-red-800 px-2 py-0.5 rounded"
                      onClick={() => setConfirmarEliminarIdx(idx)}
                    >
                      Eliminar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default Proveedores;
