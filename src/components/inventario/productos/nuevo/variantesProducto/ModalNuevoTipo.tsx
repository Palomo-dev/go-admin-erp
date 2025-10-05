"use client"

import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/config'
import toast from 'react-hot-toast'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

interface ModalNuevoTipoProps {
  isOpen: boolean
  onClose: () => void
  organizationId: number
  onSuccess: () => Promise<void>
}

export const ModalNuevoTipo = ({
  isOpen,
  onClose,
  organizationId,
  onSuccess
}: ModalNuevoTipoProps) => {
  const [isLoading, setIsLoading] = useState(false)
  const [nombreTipo, setNombreTipo] = useState("")
  // Iniciamos con 3 valores vacíos para asegurar suficientes campos
  const [valores, setValores] = useState<string[]>(['', '', ''])

  // Agregar un nuevo valor vacío al final de la lista
  const agregarValor = () => {
    setValores(prevValores => [...prevValores, ''])
  }

  // Eliminar un valor por su índice
  const eliminarValor = (index: number) => {
    // Evitar eliminar si quedarían menos de 2 campos en total
    if (valores.length <= 2) {
      toast.error('Se requieren al menos dos campos de valores')
      return
    }
    console.log(`Eliminando valor en índice ${index}`)
    setValores(prevValores => prevValores.filter((_, i) => i !== index))
  }

  // Actualizar un valor existente por su índice
  const actualizarValor = (index: number, valor: string) => {
    setValores(prevValores => {
      const nuevosValores = [...prevValores]
      nuevosValores[index] = valor
      return nuevosValores
    })
  }

  // Reiniciar el formulario a su estado inicial
  const resetForm = () => {
    setNombreTipo('')
    setValores(['', '', ''])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Formulario enviado')
    
    // Validaciones
    if (!nombreTipo.trim()) {
      toast.error('El nombre del tipo es obligatorio')
      return
    }
    
    const valoresValidos = valores.filter(v => v.trim() !== '')
    console.log('Valores válidos:', valoresValidos)
    
    if (valoresValidos.length < 2) {
      toast.error('Se requieren al menos dos valores no vacíos para crear un tipo de variante')
      return
    }

    try {
      setIsLoading(true)
      console.log('=== INICIANDO CREACIÓN DE TIPO DE VARIANTE ===')
      console.log('Organization ID:', organizationId, 'tipo:', typeof organizationId)
      console.log('Nombre del tipo:', nombreTipo, 'tipo:', typeof nombreTipo)
      console.log('Valores válidos:', valoresValidos)
      
      // Verificar que organizationId no sea null/undefined
      if (!organizationId) {
        throw new Error('Organization ID es requerido pero está vacío')
      }
      
      // 1. Insertar el tipo de variante
      console.log('Ejecutando inserción en variant_types...')
      
      // Crear el objeto de datos que se va a insertar
      const dataToInsert = {
        name: nombreTipo.trim(),
        organization_id: organizationId
      };
      console.log('Datos a insertar:', dataToInsert);
      
      // Probar primero la conexión de Supabase
      console.log('Verificando cliente Supabase...');
      const testQuery = await supabase.from('variant_types').select('count').limit(1);
      console.log('Resultado de prueba de conexión:', testQuery);
      
      const { data: tipoData, error: tipoError } = await supabase
        .from('variant_types')
        .insert(dataToInsert)
        .select('id')
        .single()
      
      console.log('Resultado de inserción:')
      console.log('- tipoData:', tipoData)
      console.log('- tipoError:', tipoError)
      console.log('- tipoError JSON:', JSON.stringify(tipoError, null, 2))
      
      if (tipoError) {
        console.error('Error al crear tipo de variante:', tipoError)
        throw new Error(`Error al crear el tipo: ${tipoError.message}`)
      }
      
      if (!tipoData || !tipoData.id) {
        throw new Error('No se recibió ID del tipo de variante creado')
      }
      
      console.log('Tipo de variante creado con ID:', tipoData.id)
      
      // 2. Insertar los valores para este tipo
      const valoresParaInsertar = valoresValidos.map((valor, index) => ({
        variant_type_id: tipoData.id,
        value: valor.trim(),
        display_order: index + 1
      }))
      
      console.log('Insertando valores:', valoresParaInsertar)
      
      const { data: valoresData, error: valoresError } = await supabase
        .from('variant_values')
        .insert(valoresParaInsertar)
        .select()
      
      if (valoresError) {
        console.error('Error al insertar valores:', valoresError)
        throw new Error(`Error al añadir valores: ${valoresError.message}`)
      }
      
      console.log('Valores insertados correctamente:', valoresData)
      toast.success('Tipo de variante creado correctamente')
      
      // Reiniciar formulario
      resetForm()
      
      // Cerrar modal y recargar tipos
      onClose()
      await onSuccess()
    } catch (error: any) {
      // Mejorar el manejo de errores para obtener información más detallada
      let errorMessage = 'No se pudo crear el tipo de variante';
      
      if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error?.details) {
        errorMessage = error.details;
      } else if (error?.hint) {
        errorMessage = error.hint;
      }
      
      toast.error(errorMessage);
      console.error('Error al crear tipo de variante:', {
        error,
        message: errorMessage,
        organizationId,
        nombreTipo,
        valoresValidos
      });
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        resetForm()
        onClose()
      }
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo tipo de variante</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nombreTipo">
              Nombre del tipo
            </Label>
            <Input
              id="nombreTipo"
              value={nombreTipo}
              onChange={(e) => setNombreTipo(e.target.value)}
              placeholder="Ej: Color, Talla, Material..."
              disabled={isLoading}
              autoFocus
            />
          </div>
          
          <div className="space-y-2">
            <Label>
              Valores (mínimo 2 valores no vacíos)
            </Label>
            
            <div className="space-y-2">
              {valores.map((valor, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={valor}
                    onChange={(e) => actualizarValor(index, e.target.value)}
                    placeholder={`Valor ${index + 1}`}
                    disabled={isLoading}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => eliminarValor(index)}
                    disabled={isLoading || valores.length <= 2}
                    className="shrink-0 h-8 w-8"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={agregarValor}
              disabled={isLoading}
              className="w-full mt-2"
            >
              <Plus className="mr-2 h-4 w-4" /> Añadir valor
            </Button>
          </div>
          
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm()
                onClose()
              }}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              onClick={handleSubmit} 
            >
              {isLoading ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
