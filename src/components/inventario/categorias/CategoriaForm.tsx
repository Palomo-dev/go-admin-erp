"use client";

import React, { useState, useEffect } from 'react';
import { Categoria } from './types';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CategoriaFormProps {
  categoria?: Categoria;
  categoriasPadre: Categoria[];
  onSubmit: (categoria: Partial<Categoria>) => void;
  onCancel: () => void;
}

const CategoriaForm: React.FC<CategoriaFormProps> = ({
  categoria,
  categoriasPadre,
  onSubmit,
  onCancel
}) => {
  // Estado del formulario
  const [formData, setFormData] = useState<{
    name: string;
    parent_id: string;
  }>({
    name: '',
    parent_id: 'null'
  });
  
  const [errors, setErrors] = useState<{
    name?: string;
  }>({});
  
  // Cargar datos iniciales si se está editando
  useEffect(() => {
    if (categoria) {
      setFormData({
        name: categoria.name,
        parent_id: categoria.parent_id ? categoria.parent_id.toString() : 'null'
      });
    }
  }, [categoria]);
  
  // Actualizar campo del formulario
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Limpiar error al cambiar el campo
    if (errors[name as keyof typeof errors]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined
      }));
    }
  };
  
  // Actualizar select de categoría padre
  const handleSelectChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      parent_id: value
    }));
  };
  
  // Validar y enviar formulario
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validaciones
    const newErrors: {name?: string} = {};
    
    if (!formData.name.trim()) {
      newErrors.name = "El nombre es obligatorio";
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    // Enviar datos
    onSubmit({
      ...categoria,
      name: formData.name.trim(),
      parent_id: formData.parent_id && formData.parent_id !== 'null' ? parseInt(formData.parent_id) : null
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
      {/* Campo de nombre */}
      <div className="space-y-1.5 sm:space-y-2">
        <Label htmlFor="name" className="text-sm dark:text-gray-200">Nombre</Label>
        <Input
          id="name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="Nombre de la categoría"
          className={`text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 ${errors.name ? "border-red-400 focus:ring-red-400 dark:border-red-500" : ""}`}
        />
        {errors.name && (
          <p className="text-xs sm:text-sm text-red-500 dark:text-red-400">{errors.name}</p>
        )}
      </div>
      
      {/* Selector de categoría padre */}
      <div className="space-y-1.5 sm:space-y-2">
        <Label htmlFor="parent_id" className="text-sm dark:text-gray-200">Categoría padre</Label>
        <Select 
          value={formData.parent_id} 
          onValueChange={handleSelectChange}
        >
          <SelectTrigger id="parent_id" className="w-full text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100">
            <SelectValue placeholder="Sin categoría padre (categoría raíz)" />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
            <SelectItem value="null" className="text-sm dark:text-gray-200 dark:focus:bg-gray-800">Sin categoría padre (categoría raíz)</SelectItem>
            {categoriasPadre.map(cat => (
              <SelectItem key={cat.id} value={cat.id.toString()} className="text-sm dark:text-gray-200 dark:focus:bg-gray-800">
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {/* Botones de acción */}
      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:space-x-2 pt-2">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onCancel}
          className="w-full sm:w-auto text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Cancelar
        </Button>
        <Button 
          type="submit"
          className="w-full sm:w-auto text-sm bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
        >
          {categoria ? "Actualizar" : "Crear"}
        </Button>
      </div>
    </form>
  );
};

export default CategoriaForm;
