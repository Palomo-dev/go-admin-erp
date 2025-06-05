"use client";

import React, { useState, useEffect } from 'react';

// Importamos las interfaces necesarias
import { Producto, EtiquetaProducto } from './types';

interface FormularioProductoProps {
  initialData?: Producto;
  onSave: (productData: Producto) => void;
  onCancel: () => void;
}

/**
 * Formulario para crear y editar productos
 * 
 * Este componente permite la creación de nuevos productos y la edición
 * de productos existentes con validación de campos.
 */
const FormularioProducto: React.FC<FormularioProductoProps> = ({
  initialData,
  onSave,
  onCancel,
}) => {
  // Estado para los datos del formulario
  const [formData, setFormData] = useState<Producto>({
    id: initialData?.id ?? Math.random().toString(36).substring(2, 15),
    nombre: '',
    sku: '',
    categoria: '',
    precio: 0,
    stock: 0,
    estado: 'activo',
    tieneVariantes: false,
    descripcion: '',
    codigoBarras: '',
    codigoQR: '',
    etiquetas: [],
    ubicacion: '',
    variantes: initialData?.variantes ?? [],
  });

  // Estado local para gestionar una variante temporal
  const [nuevaVariante, setNuevaVariante] = useState<{ nombre: string; valor: string; sku: string; stock: number; precio: number }>({ nombre: '', valor: '', sku: '', stock: 0, precio: formData.precio });
const [editandoVarianteIdx, setEditandoVarianteIdx] = useState<number | null>(null);
// Estado para error de stock de variantes
const [varianteStockError, setVarianteStockError] = useState<string>('');
  
  // Estado para gestionar una nueva etiqueta
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState<{
    nombre: string;
    color: string;
  }>({ nombre: '', color: '#3B82F6' }); // Color azul por defecto

  // Estado para errores de validación
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Categorías de ejemplo (en producción vendrían de Supabase)
  const categorias = ['Ropa', 'Calzado', 'Accesorios', 'Electrónica'];

  // Cargar datos iniciales si se está editando un producto existente
  useEffect(() => {
    if (initialData) {
      setFormData((prevData: Producto) => ({
        ...prevData,
        ...initialData,
      }));
    }
  }, [initialData]);

  // Manejar cambios en los campos del formulario
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    
    // Para checkbox, manejamos de forma diferente
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData({
        ...formData,
        [name]: checked,
        // Si se desactiva el checkbox, limpiar variantes
        ...(name === 'tieneVariantes' && !checked ? { variantes: [] } : {}),
      });
    } else if (type === 'number') {
      // Para campos numéricos, convertimos a número
      const numValue = value === '' ? 0 : parseFloat(value);
      setFormData({
        ...formData,
        [name]: numValue,
      });
    } else {
      // Resto de campos
      setFormData({
        ...formData,
        [name]: value,
      });
    }
  };

  // Manejar cambios en los inputs de variante temporal
  const handleVarianteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const { name, value, type } = e.target;
  let newValue: string | number = value;
  if (type === 'number') {
    newValue = value === '' ? 0 : parseFloat(value);
  }
  // Si el campo es sku y está vacío, autocompletar con base
  if (name === 'sku' && !value && formData.sku) {
    newValue = formData.sku + '-';
  }
  // Si el campo es precio y está vacío, poner precio base
  if (name === 'precio' && value === '') {
    newValue = formData.precio;
  }
  setNuevaVariante({
    ...nuevaVariante,
    [name]: newValue
  });
};

  // Agregar variante manualmente
  const agregarVariante = () => {
  if (editandoVarianteIdx !== null) {
    // Actualizar variante existente
    if (!nuevaVariante.nombre.trim() || !nuevaVariante.valor.trim()) return;
    if (!nuevaVariante.sku.trim()) {
      setVarianteStockError('El SKU de la variante es obligatorio.');
      return;
    }
    if (!nuevaVariante.precio || nuevaVariante.precio <= 0) {
      setVarianteStockError('El precio de la variante debe ser mayor a 0.');
      return;
    }
    if (nuevaVariante.stock <= 0) {
      setVarianteStockError('La cantidad de la variante debe ser mayor a 0.');
      return;
    }
    // Calcular nuevo total de stock (excluyendo la variante editada)
    const totalStockVariantes = (formData.variantes || []).reduce((acc, v, idx) => acc + (idx === editandoVarianteIdx ? 0 : v.stock || 0), 0) + nuevaVariante.stock;
    if (totalStockVariantes > formData.stock) {
      setVarianteStockError('La suma de las cantidades de las variantes no puede superar el stock total del producto.');
      return;
    }
    const nuevasVariantes = [...(formData.variantes || [])];
    nuevasVariantes[editandoVarianteIdx] = { ...nuevaVariante };
    setFormData({
      ...formData,
      variantes: nuevasVariantes,
    });
    setNuevaVariante({ nombre: '', valor: '', sku: '', stock: 0, precio: formData.precio });
    setEditandoVarianteIdx(null);
    setVarianteStockError('');
    return;
  }

  if (!nuevaVariante.nombre.trim() || !nuevaVariante.valor.trim()) return;
  if (nuevaVariante.stock <= 0) {
    setVarianteStockError('La cantidad de la variante debe ser mayor a 0.');
    return;
  }
  if (!nuevaVariante.sku.trim()) {
    setVarianteStockError('El SKU de la variante es obligatorio.');
    return;
  }
  if (!nuevaVariante.precio || nuevaVariante.precio <= 0) {
    setVarianteStockError('El precio de la variante debe ser mayor a 0.');
    return;
  }
  const totalStockVariantes = (formData.variantes || []).reduce((acc, v) => acc + (v.stock || 0), 0) + nuevaVariante.stock;
  if (totalStockVariantes > formData.stock) {
    setVarianteStockError('La suma de las cantidades de las variantes no puede superar el stock total del producto.');
    return;
  }
  setFormData({
    ...formData,
    variantes: [...(formData.variantes || []), { ...nuevaVariante }],
  });
  setNuevaVariante({ nombre: '', valor: '', sku: '', stock: 0, precio: formData.precio });
  setVarianteStockError('');
};

  // Editar variante por índice
  const editarVariante = (idx: number) => {
    const variante = formData.variantes?.[idx];
    if (variante) {
      setNuevaVariante({ ...variante });
      setEditandoVarianteIdx(idx);
      setVarianteStockError('');
    }
  };

  // Eliminar variante por índice
  const eliminarVariante = (idx: number) => {
    setFormData({
      ...formData,
      variantes: (formData.variantes || []).filter((_, i) => i !== idx),
    });
    setVarianteStockError('');
  };

  // Función para añadir una nueva etiqueta
  const agregarEtiqueta = () => {
    if (nuevaEtiqueta.nombre.trim() === '') return;
    
    const nuevaEtiquetaCompleta: EtiquetaProducto = {
      id: Math.random().toString(36).substring(2, 15),
      nombre: nuevaEtiqueta.nombre,
      color: nuevaEtiqueta.color
    };
    
    setFormData({
      ...formData,
      etiquetas: [...(formData.etiquetas || []), nuevaEtiquetaCompleta]
    });
    
    // Limpiar el campo
    setNuevaEtiqueta({ nombre: '', color: nuevaEtiqueta.color });
  };
  
  // Función para eliminar una etiqueta
  const eliminarEtiqueta = (etiquetaId: string) => {
    setFormData({
      ...formData,
      etiquetas: formData.etiquetas?.filter((etq: EtiquetaProducto) => etq.id !== etiquetaId) || []
    });
  };
  
  // Función para manejar cambios en la nueva etiqueta
  const handleEtiquetaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNuevaEtiqueta({
      ...nuevaEtiqueta,
      [name]: value
    });
  };

  // Validar el formulario antes de guardarlo
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.nombre.trim()) {
      newErrors.nombre = 'El nombre es obligatorio';
    }

    if (!formData.sku.trim()) {
      newErrors.sku = 'El SKU es obligatorio';
    }

    if (!formData.categoria) {
      newErrors.categoria = 'Debes seleccionar una categoría';
    }

    if (formData.precio <= 0) {
      newErrors.precio = 'El precio debe ser mayor a 0';
    }

    if (formData.stock < 0) {
      newErrors.stock = 'El stock no puede ser negativo';
    }
    
    // Validaciones para códigos de barras y QR (opcionales)
    if (formData.codigoBarras && !/^\d+$/.test(formData.codigoBarras)) {
      newErrors.codigoBarras = 'El código de barras debe contener solo números';
    }
    
    if (formData.codigoQR && formData.codigoQR.length > 255) {
      newErrors.codigoQR = 'El código QR es demasiado largo';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Manejar el envío del formulario
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSave(formData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Información básica */}
        <div className="md:col-span-2">
          <h2 className="text-lg font-medium text-gray-800 mb-3">Información básica</h2>
        </div>

        {/* Nombre del producto */}
        <div>
          <label htmlFor="nombre" className="block text-sm font-medium text-gray-700 mb-1">
            Nombre del producto <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="nombre"
            name="nombre"
            value={formData.nombre}
            onChange={handleChange}
            className={`block w-full py-2 px-3 border ${
              errors.nombre ? 'border-red-500' : 'border-gray-300'
            } rounded-md bg-white text-gray-800`}
            placeholder="Nombre del producto"
          />
          {errors.nombre && <p className="mt-1 text-sm text-red-600">{errors.nombre}</p>}
        </div>

        {/* SKU */}
        <div>
          <label htmlFor="sku" className="block text-sm font-medium text-gray-700 mb-1">
            SKU <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="sku"
            name="sku"
            value={formData.sku}
            onChange={handleChange}
            className={`block w-full py-2 px-3 border ${
              errors.sku ? 'border-red-500' : 'border-gray-300'
            } rounded-md bg-white text-gray-800`}
            placeholder="SKU-001"
          />
          {errors.sku && <p className="mt-1 text-sm text-red-600">{errors.sku}</p>}
        </div>

        {/* Categoría */}
        <div>
          <label htmlFor="categoria" className="block text-sm font-medium text-gray-700 mb-1">
            Categoría <span className="text-red-500">*</span>
          </label>
          <select
            id="categoria"
            name="categoria"
            value={formData.categoria}
            onChange={handleChange}
            className={`block w-full py-2 px-3 border ${
              errors.categoria ? 'border-red-500' : 'border-gray-300'
            } rounded-md bg-white text-gray-800`}
          >
            <option value="">Seleccionar categoría</option>
            {categorias.map((categoria) => (
              <option key={categoria} value={categoria}>
                {categoria}
              </option>
            ))}
          </select>
          {errors.categoria && <p className="mt-1 text-sm text-red-600">{errors.categoria}</p>}
        </div>

        {/* Estado */}
        <div>
          <label htmlFor="estado" className="block text-sm font-medium text-gray-700 mb-1">
            Estado
          </label>
          <select
            id="estado"
            name="estado"
            value={formData.estado}
            onChange={handleChange}
            className="block w-full py-2 px-3 border border-gray-300 rounded-md bg-white text-gray-800"
          >
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </div>

        {/* Precio */}
        <div>
          <label htmlFor="precio" className="block text-sm font-medium text-gray-700 mb-1">
            Precio <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-gray-500 sm:text-sm">$</span>
            </div>
            <input
              type="number"
              id="precio"
              name="precio"
              value={formData.precio === 0 ? '' : formData.precio}
              onChange={handleChange}
              min="0"
              step="100"
              className={`block w-full py-2 pl-7 pr-3 border ${
                errors.precio ? 'border-red-500' : 'border-gray-300'
              } rounded-md bg-white text-gray-800`}
              placeholder="0"
              onFocus={(e) => {
                if (formData.precio === 0) {
                  setFormData({ ...formData, precio: undefined as unknown as number });
                }
              }}
              onBlur={(e) => {
                if (!e.target.value) {
                  setFormData({ ...formData, precio: 0 });
                }
              }}
            />
          </div>
          {errors.precio && <p className="mt-1 text-sm text-red-600">{errors.precio}</p>}
        </div>

        {/* Stock */}
        <div>
          <label htmlFor="stock" className="block text-sm font-medium text-gray-700 mb-1">
            Stock inicial
          </label>
          <input
            type="number"
            id="stock"
            name="stock"
            value={formData.stock === 0 ? '' : formData.stock}
            onChange={handleChange}
            onFocus={(e) => {
              if (formData.stock === 0) {
                setFormData({ ...formData, stock: undefined as unknown as number });
              }
            }}
            onBlur={(e) => {
              if (e.target.value === '' || isNaN(Number(e.target.value))) {
                setFormData({ ...formData, stock: 0 });
              }
            }}
            min="0"
            className={`block w-full py-2 px-3 border ${
              errors.stock ? 'border-red-500' : 'border-gray-300'
            } rounded-md bg-white text-gray-800`}
            placeholder="0"
          />
          {errors.stock && <p className="mt-1 text-sm text-red-600">{errors.stock}</p>}
        </div>

        {/* Tiene variantes */}
        <div className="md:col-span-2">
          <div className="flex items-start">
            <div className="flex items-center h-5">
              <input
                id="tieneVariantes"
                name="tieneVariantes"
                type="checkbox"
                checked={formData.tieneVariantes}
                onChange={handleChange}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
            </div>
            <div className="ml-3 text-sm">
              <label htmlFor="tieneVariantes" className="font-medium text-gray-700">
                Este producto tiene variantes
              </label>
              <p className="text-gray-500">
                Las variantes permiten tener diferentes versiones del mismo producto (tallas, colores, etc.)
              </p>
            </div>
          </div>

          {/* Sección de variantes solo si está activo */}
          {formData.tieneVariantes && (
            <div className="mt-4 mb-4 border rounded-md p-4 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Variantes</h3>
              {/* Lista de variantes actuales */}
              {formData.variantes && formData.variantes.length > 0 ? (
                <table className="mb-3 w-full text-xs">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="text-left font-semibold text-gray-800 px-2 py-1">Nombre</th>
                      <th className="text-left font-semibold text-gray-800 px-2 py-1">Valor</th>
                      <th className="text-left font-semibold text-gray-800 px-2 py-1">SKU</th>
                      <th className="text-left font-semibold text-gray-800 px-2 py-1">Cantidad</th>
                      <th className="text-left font-semibold text-gray-800 px-2 py-1">Precio</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.variantes.map((v, idx) => (
  <tr key={idx} className="border-b">
    <td className="px-2 py-1 text-gray-800">{v.nombre}</td>
    <td className="px-2 py-1 text-gray-800">{v.valor}</td>
    <td className="px-2 py-1 text-gray-800">{v.sku}</td>
    <td className="px-2 py-1 text-gray-800">{v.stock}</td>
    <td className="px-2 py-1 text-gray-800">{v.precio.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
    <td className="px-2 py-1 flex gap-2">
      <button
        type="button"
        onClick={() => editarVariante(idx)}
        className="text-xs text-blue-600 hover:text-blue-800 px-2 py-0.5 rounded"
        aria-label="Editar variante"
      >
        Editar
      </button>
      <button
        type="button"
        onClick={() => eliminarVariante(idx)}
        className="text-xs text-red-600 hover:text-red-800 px-2 py-0.5 rounded"
        aria-label="Eliminar variante"
      >
        Eliminar
      </button>
    </td>
  </tr>
))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-gray-500 mb-2">No hay variantes añadidas</p>
              )}
              {/* Formulario para agregar variante */}
              <div className="flex gap-2">
                <input
                  type="text"
                  name="nombre"
                  value={nuevaVariante.nombre}
                  onChange={handleVarianteChange}
                  placeholder="Nombre (ej: Talla, Color)"
                  className="flex-1 py-1 px-2 border border-gray-300 rounded-md text-xs text-gray-800"
                />
                <input
                  type="text"
                  name="valor"
                  value={nuevaVariante.valor}
                  onChange={handleVarianteChange}
                  placeholder="Valor (ej: M, Azul)"
                  className="flex-1 py-1 px-2 border border-gray-300 rounded-md text-xs text-gray-800"
                />
                <input
  type="text"
  name="sku"
  value={nuevaVariante.sku}
  onChange={handleVarianteChange}
  onFocus={() => {
    if (!nuevaVariante.sku && formData.sku) {
      setNuevaVariante({ ...nuevaVariante, sku: formData.sku + '-' });
    }
  }}
  placeholder={`SKU (ej: ${formData.sku}-S-R)`}
  className="flex-1 py-1 px-2 border border-gray-300 rounded-md text-xs text-gray-800"
/>
<input
  type="number"
  name="stock"
  value={nuevaVariante.stock === 0 ? '' : nuevaVariante.stock}
  min={0}
  onChange={handleVarianteChange}
  onFocus={e => {
    if (nuevaVariante.stock === 0) {
      setNuevaVariante({ ...nuevaVariante, stock: undefined as unknown as number });
    }
  }}
  onBlur={e => {
    if (e.target.value === '' || isNaN(Number(e.target.value))) {
      setNuevaVariante({ ...nuevaVariante, stock: 0 });
    }
  }}
  placeholder="Cantidad"
  className="w-20 py-1 px-2 border border-gray-300 rounded-md text-xs text-gray-800"
/>
<input
  type="number"
  name="precio"
  value={nuevaVariante.precio === 0 ? '' : nuevaVariante.precio}
  min={0}
  onChange={handleVarianteChange}
  onFocus={e => {
    if (!nuevaVariante.precio || nuevaVariante.precio === 0) {
      setNuevaVariante({ ...nuevaVariante, precio: formData.precio });
    }
  }}
  onBlur={e => {
    if (e.target.value === '' || isNaN(Number(e.target.value))) {
      setNuevaVariante({ ...nuevaVariante, precio: 0 });
    }
  }}
  placeholder={`Precio (${formData.precio})`}
  className="w-24 py-1 px-2 border border-gray-300 rounded-md text-xs text-gray-800"
/>
                {editandoVarianteIdx === null ? (
  <button
    type="button"
    onClick={agregarVariante}
    className="px-3 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
  >
    Añadir
  </button>
) : (
  <>
    <button
      type="button"
      onClick={agregarVariante}
      className="px-3 py-1 text-xs font-medium bg-green-100 text-green-700 rounded hover:bg-green-200"
    >
      Actualizar
    </button>
    <button
      type="button"
      onClick={() => {
        setNuevaVariante({ nombre: '', valor: '', sku: '', stock: 0, precio: formData.precio });
        setEditandoVarianteIdx(null);
        setVarianteStockError('');
      }}
      className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 ml-1"
    >
      Cancelar
    </button>
  </>
)}
              </div>
              {varianteStockError && <p className="text-xs text-red-600 mt-1">{varianteStockError}</p>}
              <p className="mt-1 text-xs text-gray-500">Ejemplo: Talla: M, Color: Azul, SKU: {formData.sku}-M-A, Cantidad: 5, Precio: {formData.precio}</p>
            </div>
          )}

          {/* Descripción */}
          <label htmlFor="descripcion" className="block text-sm font-medium text-gray-700 mb-1">
            Descripción del producto
          </label>
          <textarea
            id="descripcion"
            name="descripcion"
            rows={4}
            value={formData.descripcion}
            onChange={handleChange}
            className="block w-full py-2 px-3 border border-gray-300 rounded-md bg-white text-gray-800"
            placeholder="Describe tu producto..."
          />
        </div>

        {/* Sección de seguimiento de inventario */}
        <div className="md:col-span-2 mt-6">
          <h2 className="text-lg font-medium text-gray-800 mb-3">Seguimiento de inventario</h2>
        </div>

        {/* Códigos de barras */}
        <div>
          <label htmlFor="codigoBarras" className="block text-sm font-medium text-gray-700 mb-1">
            Código de barras
          </label>
          <input
            type="text"
            id="codigoBarras"
            name="codigoBarras"
            value={formData.codigoBarras ?? ''}
            onChange={handleChange}
            className={`block w-full py-2 px-3 border ${errors.codigoBarras ? 'border-red-500' : 'border-gray-300'} rounded-md bg-white text-gray-800`}
            placeholder="Código de barras (solo números)"
          />
          {errors.codigoBarras && <p className="mt-1 text-sm text-red-600">{errors.codigoBarras}</p>}
          <p className="mt-1 text-xs text-gray-500">Utilizado para escaneo en puntos de venta</p>
        </div>

        {/* Código QR */}
        <div>
          <label htmlFor="codigoQR" className="block text-sm font-medium text-gray-700 mb-1">
            Código QR (identificador)
          </label>
          <input
            type="text"
            id="codigoQR"
            name="codigoQR"
            value={formData.codigoQR ?? ''}
            onChange={handleChange}
            className="block w-full py-2 px-3 border border-gray-300 rounded-md bg-white text-gray-800"
            placeholder="Identificador para código QR"
          />
          {errors.codigoQR && <p className="mt-1 text-sm text-red-600">{errors.codigoQR}</p>}
          <p className="mt-1 text-xs text-gray-500">Puede ser un URL o identificador único</p>
        </div>
        
        {/* Ubicación física */}
        <div>
          <label htmlFor="ubicacion" className="block text-sm font-medium text-gray-700 mb-1">
            Ubicación en almacén
          </label>
          <input
            type="text"
            id="ubicacion"
            name="ubicacion"
            value={formData.ubicacion ?? ''}
            onChange={handleChange}
            className="block w-full py-2 px-3 border border-gray-300 rounded-md bg-white text-gray-800"
            placeholder="Ej: Bodega A - Estante 3"
          />
          <p className="mt-1 text-xs text-gray-500">Facilita la localización física del producto</p>
        </div>

        {/* Etiquetas */}
        <div className="md:col-span-2">
          <label htmlFor="nuevaEtiqueta" className="block text-sm font-medium text-gray-700 mb-2">
            Etiquetas
          </label>
          
          {/* Lista de etiquetas actuales */}
          <div className="flex flex-wrap gap-2 mb-3">
            {formData.etiquetas && formData.etiquetas.length > 0 ? (
              formData.etiquetas.map((etiqueta: EtiquetaProducto) => (
                <div 
                  key={etiqueta.id} 
                  className="flex items-center gap-1 px-2 py-1 rounded-full text-sm" 
                  style={{ backgroundColor: etiqueta.color + '20', color: etiqueta.color }}
                >
                  <span>{etiqueta.nombre}</span>
                  <button 
                    type="button" 
                    onClick={() => eliminarEtiqueta(etiqueta.id)}
                    className="ml-1 text-sm hover:text-gray-700"
                  >
                    ×
                  </button>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">No hay etiquetas añadidas</p>
            )}
          </div>

          {/* Formulario para agregar etiquetas */}
          <div className="flex gap-2">
            <div className="flex-grow">
              <input
                type="text"
                id="nuevaEtiqueta"
                name="nombre"
                value={nuevaEtiqueta.nombre}
                onChange={handleEtiquetaChange}
                placeholder="Nueva etiqueta"
                className="block w-full py-2 px-3 border border-gray-300 rounded-md bg-white text-gray-800"
              />
            </div>
            <div className="w-20">
              <input
                type="color"
                name="color"
                value={nuevaEtiqueta.color}
                onChange={handleEtiquetaChange}
                className="block w-full h-full border border-gray-300 rounded-md cursor-pointer"
              />
            </div>
            <button
              type="button"
              onClick={agregarEtiqueta}
              className="px-3 py-2 text-sm font-medium bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200"
            >
              Añadir
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">Las etiquetas ayudan a organizar y filtrar los productos</p>
        </div>
      </div>

      {/* Botones de acción */}
      <div className="mt-8 flex justify-end space-x-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {initialData ? 'Guardar cambios' : 'Crear producto'}
        </button>
      </div>
    </form>
  );
};

export default FormularioProducto;
