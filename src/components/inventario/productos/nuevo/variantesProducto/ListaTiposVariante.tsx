"use client"

import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase/config'
import toast from 'react-hot-toast'

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { VariantType, EditingValueState } from './types'
import { ValorVariante } from './ValorVariante'

interface ListaTiposVarianteProps {
  selectedVariantTypes: VariantType[]
  onRemoveType: (index: number) => void
  onToggleValue: (tipoIndex: number, valorId: number | string) => void
  onUpdateTypes: (types: VariantType[]) => void
  reloadTypes: () => Promise<void>
}

export const ListaTiposVariante = ({
  selectedVariantTypes,
  onRemoveType,
  onToggleValue,
  onUpdateTypes,
  reloadTypes
}: ListaTiposVarianteProps) => {
  const [isLoading, setIsLoading] = useState(false)
  const [editingTypeIndex, setEditingTypeIndex] = useState<number | null>(null)
  const [newValue, setNewValue] = useState("")
  const [editingValue, setEditingValue] = useState<EditingValueState | null>(null)

  const agregarValorATipo = async (tipoIndex: number) => {
    if (!newValue.trim()) {
      toast.error('El valor no puede estar vacío')
      return
    }
    
    try {
      const tipo = selectedVariantTypes[tipoIndex]
      setIsLoading(true)
      
      // Asegurarse de que tipo.values exista y sea un array
      const valoresExistentes = tipo.values || []
      
      // Encontrar el mayor display_order actual
      const maxOrder = valoresExistentes.length > 0 
        ? Math.max(...valoresExistentes.map((v: any) => v.display_order || 0)) 
        : 0
      
      // Insertar el nuevo valor en la base de datos
      const { data, error } = await supabase
        .from('variant_values')
        .insert({
          variant_type_id: tipo.id,
          value: newValue.trim(),
          display_order: maxOrder + 1
        })
        .select('id, value, display_order')
        .single()
      
      if (error) throw error
      
      // Actualizar el estado local
      const tiposActualizados = [...selectedVariantTypes]
      
      // Añadir el nuevo valor al array de valores del tipo
      tiposActualizados[tipoIndex].values = [...tiposActualizados[tipoIndex].values, data]
      
      // IMPORTANTE: También seleccionar automáticamente el nuevo valor para que aparezca en las combinaciones
      // Inicializar selectedValues si no existe
      if (!tiposActualizados[tipoIndex].selectedValues) {
        tiposActualizados[tipoIndex].selectedValues = []
      }
      
      // Añadir el ID del nuevo valor a selectedValues si no está ya
      if (!tiposActualizados[tipoIndex].selectedValues.includes(data.id)) {
        tiposActualizados[tipoIndex].selectedValues.push(data.id)
      }
      
      // Actualizar el estado y cerrar el editor
      onUpdateTypes(tiposActualizados)
      setNewValue('')
      setEditingTypeIndex(null)
      
      toast.success(`Valor "${newValue}" añadido correctamente`)
      
      // También llamar a onToggleValue para asegurarnos de que se regeneren las combinaciones
      onToggleValue(tipoIndex, data.id)
      
      // Recargar todos los tipos para mantener sincronizado
      reloadTypes()
    } catch (error: any) {
      toast.error(error.message || 'No se pudo añadir el valor')
      console.error('Error al añadir valor:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const guardarEdicionValor = async () => {
    if (!editingValue || !editingValue.value.trim()) {
      toast.error('El valor no puede estar vacío')
      return
    }
    
    try {
      setIsLoading(true)
      const tipo = selectedVariantTypes[editingValue.index]
      const valorId = editingValue.id
      
      // Actualizar en la base de datos
      const { error } = await supabase
        .from('variant_values')
        .update({ value: editingValue.value.trim() })
        .eq('id', valorId)
      
      if (error) throw error
      
      // Actualizar el estado local
      const tiposActualizados = [...selectedVariantTypes]
      const valorIndex = tiposActualizados[editingValue.index].values.findIndex((v: any) => v.id === valorId)
      
      if (valorIndex >= 0) {
        tiposActualizados[editingValue.index].values[valorIndex].value = editingValue.value.trim()
      }
      
      onUpdateTypes(tiposActualizados)
      setEditingValue(null)
      
      toast.success('Valor actualizado correctamente')
      
      // Recargar todos los tipos para mantener sincronizado
      reloadTypes()
    } catch (error: any) {
      toast.error(error.message || 'No se pudo actualizar el valor')
      console.error('Error al editar valor:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const eliminarValorVariante = async (tipoIndex: number, valorId: number) => {
    try {
      setIsLoading(true)
      
      // Eliminar de la base de datos
      const { error } = await supabase
        .from('variant_values')
        .delete()
        .eq('id', valorId)
      
      if (error) throw error
      
      // Actualizar estado local
      const tiposActualizados = [...selectedVariantTypes]
      tiposActualizados[tipoIndex].values = tiposActualizados[tipoIndex].values.filter((v: any) => v.id !== valorId)
      
      // Si era un valor seleccionado, eliminarlo también de los seleccionados
      if (tiposActualizados[tipoIndex].selectedValues && tiposActualizados[tipoIndex].selectedValues.includes(valorId)) {
        tiposActualizados[tipoIndex].selectedValues = tiposActualizados[tipoIndex].selectedValues.filter(
          (v: number) => v !== valorId
        )
      }
      
      onUpdateTypes(tiposActualizados)
      
      toast.success('Valor eliminado correctamente')
      
      // Recargar todos los tipos para mantener sincronizado
      reloadTypes()
    } catch (error: any) {
      toast.error(error.message || 'No se pudo eliminar el valor')
      console.error('Error al eliminar valor:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {selectedVariantTypes.map((tipo, index) => (
        <Card key={index} className="dark:bg-gray-800/50 light:bg-gray-100/80 dark:border-gray-700/50 light:border-gray-300/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-medium dark:text-gray-100 light:text-gray-800">{tipo.name}</h4>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingTypeIndex(index === editingTypeIndex ? null : index)}
                  className="dark:bg-gray-700/50 dark:hover:bg-gray-700 light:bg-white light:hover:bg-gray-100"
                >
                  {index === editingTypeIndex ? 'Cancelar' : 'Añadir valor'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveType(index)}
                  className="dark:text-gray-300 dark:hover:text-white light:text-gray-600 light:hover:text-gray-900"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              {tipo.values && tipo.values.map((valor) => (
                <ValorVariante 
                  key={valor.id}
                  valor={valor}
                  isSelected={tipo.selectedValues?.includes(valor.id)}
                  onToggle={() => onToggleValue(index, valor.id)}
                  onEdit={() => setEditingValue({ index, id: valor.id, value: valor.value })}
                  onDelete={() => eliminarValorVariante(index, valor.id)}
                />
              ))}
              {/* Mensaje cuando no hay valores */}
              {(!tipo.values || tipo.values.length === 0) && (
                <p className="text-sm text-gray-500 dark:text-gray-400 italic">No hay valores disponibles</p>
              )}
            </div>
            
            {/* Formulario para añadir nuevo valor */}
            {editingTypeIndex === index && !editingValue && (
              <div className="flex items-center gap-2 mt-3">
                <Input 
                  type="text" 
                  value={newValue} 
                  placeholder="Nuevo valor..."
                  className="h-8 text-sm dark:bg-gray-700 dark:border-gray-600 light:bg-white"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewValue(e.target.value)}
                  onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && agregarValorATipo(index)}
                />
                <Button 
                  type="button" 
                  size="sm" 
                  variant="default" 
                  onClick={() => agregarValorATipo(index)}
                  disabled={isLoading}
                  className="dark:bg-purple-600 dark:hover:bg-purple-700 light:bg-purple-500 light:hover:bg-purple-600"
                >
                  Añadir
                </Button>
              </div>
            )}
            
            {/* Formulario para editar valor existente */}
            {editingValue && editingValue.index === index && (
              <div className="flex items-center gap-2 mt-3">
                <Input 
                  type="text" 
                  value={editingValue.value} 
                  className="h-8 text-sm dark:bg-gray-700 dark:border-gray-600 light:bg-white"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                    setEditingValue({ ...editingValue, value: e.target.value })
                  }
                  onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && guardarEdicionValor()}
                />
                <Button 
                  type="button" 
                  size="sm" 
                  variant="default" 
                  onClick={guardarEdicionValor}
                  disabled={isLoading}
                  className="dark:bg-purple-600 dark:hover:bg-purple-700 light:bg-purple-500 light:hover:bg-purple-600"
                >
                  Guardar
                </Button>
                <Button 
                  type="button" 
                  size="sm" 
                  variant="ghost"
                  onClick={() => setEditingValue(null)}
                  disabled={isLoading}
                  className="dark:text-gray-300 dark:hover:text-white light:text-gray-600 light:hover:text-gray-900"
                >
                  Cancelar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
