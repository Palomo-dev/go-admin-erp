"use client";

import React, { useState, useEffect } from 'react';
import { Categoria, CategoriaAtributo } from './types';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlusCircle, X } from "lucide-react";

interface CategoriaAtributosProps {
  categoria: Categoria;
  onGuardar: (atributos: CategoriaAtributo[]) => void;
}

/**
 * Componente para gestionar los atributos de una categoría
 * 
 * Permite definir atributos comunes para todos los productos de la categoría,
 * como vencimiento, marcas, tallas, etc.
 */
const CategoriaAtributos: React.FC<CategoriaAtributosProps> = ({
  categoria,
  onGuardar
}) => {
  // Estado para manejar los atributos
  const [atributos, setAtributos] = useState<CategoriaAtributo[]>([]);
  const [nuevoAtributo, setNuevoAtributo] = useState<Partial<CategoriaAtributo>>({
    name: '',
    tipo: 'texto',
    obligatorio: false,
    opciones: []
  });

  // Al iniciar, podríamos cargar atributos existentes desde la BD
  useEffect(() => {
    // Aquí podríamos consultar a Supabase si existen atributos para la categoría
    // Por ahora, solo inicializamos vacío
    setAtributos([]);
  }, [categoria.id]);

  // Manejar cambios en el nuevo atributo
  const handleNuevoAtributoChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value, type, checked } = e.target;
    setNuevoAtributo(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Manejar cambios en el tipo de atributo
  const handleTipoChange = (value: string) => {
    setNuevoAtributo(prev => ({
      ...prev,
      tipo: value as CategoriaAtributo['tipo']
    }));
  };

  // Manejar cambio en el switch de obligatorio
  const handleObligatorioChange = (checked: boolean) => {
    setNuevoAtributo(prev => ({
      ...prev,
      obligatorio: checked
    }));
  };

  // Agregar opción para atributos de tipo selección
  const agregarOpcion = (opcion: string) => {
    if (!opcion.trim()) return;
    
    setNuevoAtributo(prev => ({
      ...prev,
      opciones: [...(prev.opciones || []), opcion.trim()]
    }));
  };

  // Eliminar una opción
  const eliminarOpcion = (index: number) => {
    setNuevoAtributo(prev => ({
      ...prev,
      opciones: prev.opciones?.filter((_, i) => i !== index)
    }));
  };

  // Agregar nuevo atributo
  const agregarAtributo = () => {
    if (!nuevoAtributo.name?.trim()) return;

    // Crear nuevo atributo con ID temporal (en producción usaríamos Supabase)
    const nuevoAtributoCompleto: CategoriaAtributo = {
      id: Math.floor(Math.random() * -1000), // ID negativo temporal 
      category_id: categoria.id,
      name: nuevoAtributo.name.trim(),
      tipo: nuevoAtributo.tipo as CategoriaAtributo['tipo'],
      obligatorio: nuevoAtributo.obligatorio || false,
      opciones: nuevoAtributo.tipo === 'seleccion' ? nuevoAtributo.opciones : undefined
    };

    // Actualizar lista de atributos
    setAtributos([...atributos, nuevoAtributoCompleto]);

    // Resetear formulario
    setNuevoAtributo({
      name: '',
      tipo: 'texto',
      obligatorio: false,
      opciones: []
    });
  };

  // Eliminar un atributo existente
  const eliminarAtributo = (id: number) => {
    setAtributos(atributos.filter(a => a.id !== id));
  };

  // Guardar todos los atributos
  const guardarAtributos = () => {
    onGuardar(atributos);
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
        <h3 className="text-lg font-medium mb-2">Atributos para {categoria.name}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Define atributos comunes para todos los productos de esta categoría.
        </p>
      </div>

      {/* Lista de atributos existentes */}
      {atributos.length > 0 ? (
        <div className="space-y-4">
          <h4 className="font-medium">Atributos definidos</h4>
          <div className="border rounded-md divide-y divide-gray-200 dark:divide-gray-700">
            {atributos.map((atributo) => (
              <div key={atributo.id} className="flex items-center justify-between p-3">
                <div>
                  <p className="font-medium">{atributo.name}</p>
                  <div className="flex space-x-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>Tipo: {atributo.tipo}</span>
                    {atributo.obligatorio && (
                      <span className="font-semibold text-blue-600 dark:text-blue-400">Obligatorio</span>
                    )}
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => eliminarAtributo(atributo.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-4 text-gray-500 dark:text-gray-400 italic">
          No hay atributos definidos para esta categoría.
        </div>
      )}

      {/* Formulario para agregar nuevo atributo */}
      <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-md space-y-4">
        <h4 className="font-medium">Nuevo atributo</h4>
        
        <div className="grid gap-3">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre del atributo</Label>
            <Input
              id="name"
              name="name"
              value={nuevoAtributo.name}
              onChange={handleNuevoAtributoChange}
              placeholder="Ej: Vencimiento, Talla, Color..."
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="tipo">Tipo de dato</Label>
            <Select 
              value={nuevoAtributo.tipo} 
              onValueChange={handleTipoChange}
            >
              <SelectTrigger id="tipo">
                <SelectValue placeholder="Selecciona un tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="texto">Texto</SelectItem>
                <SelectItem value="numero">Número</SelectItem>
                <SelectItem value="fecha">Fecha</SelectItem>
                <SelectItem value="booleano">Sí/No</SelectItem>
                <SelectItem value="seleccion">Selección</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch
              id="obligatorio"
              checked={nuevoAtributo.obligatorio}
              onCheckedChange={handleObligatorioChange}
            />
            <Label htmlFor="obligatorio">Obligatorio</Label>
          </div>

          {/* Opciones para tipo selección */}
          {nuevoAtributo.tipo === 'seleccion' && (
            <div className="space-y-2">
              <Label>Opciones disponibles</Label>
              
              <div className="flex gap-2 mb-2">
                <Input
                  id="nuevaOpcion"
                  placeholder="Nueva opción..."
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      agregarOpcion((e.target as HTMLInputElement).value);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                />
                <Button 
                  variant="outline"
                  onClick={() => {
                    const input = document.getElementById('nuevaOpcion') as HTMLInputElement;
                    if (input) {
                      agregarOpcion(input.value);
                      input.value = '';
                    }
                  }}
                >
                  Agregar
                </Button>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {nuevoAtributo.opciones?.map((opcion, index) => (
                  <div 
                    key={index}
                    className="bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full text-sm 
                             flex items-center group"
                  >
                    {opcion}
                    <button 
                      className="ml-2 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                      onClick={() => eliminarOpcion(index)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <Button 
            onClick={agregarAtributo}
            disabled={!nuevoAtributo.name?.trim()}
            className="w-full mt-2"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Agregar atributo
          </Button>
        </div>
      </div>
      
      {/* Botón guardar */}
      <div className="flex justify-end">
        <Button onClick={guardarAtributos}>
          Guardar atributos
        </Button>
      </div>
    </div>
  );
};

export default CategoriaAtributos;
