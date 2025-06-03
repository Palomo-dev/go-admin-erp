"use client";

import React, { useState, useEffect } from 'react';

interface ProductoBase {
  id?: string;
  nombre: string;
  sku: string;
  categoria: string;
  precio: number;
  stock: number;
  estado: string;
  tieneVariantes: boolean;
  descripcion: string;
}

interface FormularioProductoProps {
  initialData?: ProductoBase;
  onSave: (productData: ProductoBase) => void;
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
  const [formData, setFormData] = useState<ProductoBase>({
    nombre: '',
    sku: '',
    categoria: '',
    precio: 0,
    stock: 0,
    estado: 'activo',
    tieneVariantes: false,
    descripcion: '',
  });

  // Estado para errores de validación
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Categorías de ejemplo (en producción vendrían de Supabase)
  const categorias = ['Ropa', 'Calzado', 'Accesorios', 'Electrónica'];

  // Cargar datos iniciales si se está editando un producto existente
  useEffect(() => {
    if (initialData) {
      setFormData(prevData => ({
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
              value={formData.precio || ''}
              onChange={handleChange}
              min="0"
              step="100"
              className={`block w-full py-2 pl-7 pr-3 border ${
                errors.precio ? 'border-red-500' : 'border-gray-300'
              } rounded-md bg-white text-gray-800`}
              placeholder="0"
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
            value={formData.stock || ''}
            onChange={handleChange}
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
        </div>

        {/* Descripción */}
        <div className="md:col-span-2">
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
