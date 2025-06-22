"use client"

import { useEffect, useState } from 'react'
import { UseFormReturn } from 'react-hook-form'
import { supabase } from '@/lib/supabase/config'
import { PlusCircle, Trash2, AlertCircle, Loader2 } from 'lucide-react'

import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from '@/components/ui/form'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'

interface InventarioProps {
  form: UseFormReturn<any>
}

export default function Inventario({ form }: InventarioProps) {
  const [sucursales, setSucursales] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [stockItems, setStockItems] = useState<any[]>([])

  // Obtener la organización activa del localStorage o usar ID 2 como respaldo
  const getOrganizacionActiva = () => {
    if (typeof window !== 'undefined') {
      try {
        const orgData = localStorage.getItem('organizacionActiva')
        return orgData ? JSON.parse(orgData) : { id: 2 } // Usar ID 2 como valor por defecto
      } catch (err) {
        console.error('Error al obtener organización del localStorage:', err)
        return { id: 2 } // Valor de respaldo si hay error
      }
    }
    return { id: 2 } // Valor de respaldo para SSR
  }

  const organizacion = getOrganizacionActiva()
  const organization_id = organizacion?.id

  useEffect(() => {
    const cargarSucursales = async () => {
      setIsLoading(true)
      setError('')
      try {
        if (organization_id) {
          // Eliminado console.log para reducir ruido
          let { data, error } = await supabase
            .from('branches')
            .select('id, name')
            .eq('organization_id', organization_id)
            .eq('is_active', true)
            .order('name')
          
          if (error) throw error;
          
          // Si no hay sucursales para este ID de organización, intentar con ID 2
          if (!data || data.length === 0) {
            // Eliminado console.log para reducir ruido
            const respuesta = await supabase
              .from('branches')
              .select('id, name')
              .eq('organization_id', 2)
              .eq('is_active', true)
              .order('name')
            
            data = respuesta.data || []
          }
          
          // Eliminado console.log para reducir ruido
          setSucursales(data || [])
        } else {
          // Cargar sucursales con ID 2 como respaldo
          // Eliminado console.log para reducir ruido
          const { data } = await supabase
            .from('branches')
            .select('id, name')
            .eq('organization_id', 2)
            .eq('is_active', true)
            .order('name')
          
          setSucursales(data || [])
        }
      } catch (error: any) {
        console.error('Error al cargar sucursales:', error)
        setError(error?.message || 'Error al cargar sucursales. Por favor, intenta de nuevo.')
      } finally {
        setIsLoading(false)
      }
    }

    cargarSucursales()
  }, [organization_id])

  // Gestión del stock inicial
  const agregarStockItem = () => {
    const nuevoItem = {
      branch_id: null,
      qty_on_hand: 0,
      avg_cost: form.getValues('cost') || 0
    }
    
    const nuevosItems = [...stockItems, nuevoItem]
    setStockItems(nuevosItems)
    form.setValue('stock_inicial', nuevosItems)
  }

  const eliminarStockItem = (index: number) => {
    const nuevosItems = stockItems.filter((_, i) => i !== index)
    setStockItems(nuevosItems)
    form.setValue('stock_inicial', nuevosItems)
  }

  const actualizarStockItem = (index: number, campo: string, valor: any) => {
    const nuevosItems = [...stockItems]
    nuevosItems[index][campo] = valor
    setStockItems(nuevosItems)
    form.setValue('stock_inicial', nuevosItems)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Control de Inventario</h3>
      </div>
      
      <FormField
        control={form.control}
        name="track_stock"
        render={({ field }) => (
          <FormItem className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <FormLabel className="text-base">Control de Inventario</FormLabel>
              <FormDescription>
                Activar para hacer seguimiento del stock de este producto
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </FormControl>
          </FormItem>
        )}
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      

      <FormField
        control={form.control}
        name="status"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Estado</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar estado" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="inactive">Inactivo</SelectItem>
                <SelectItem value="discontinued">Discontinuado</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      
      {/* Stock inicial */}
      {form.watch('track_stock') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-medium">Stock Inicial por Sucursal</h4>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={agregarStockItem}
              disabled={sucursales.length === 0 || isLoading}
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Agregar Sucursal
            </Button>
          </div>
          
          {stockItems.length > 0 ? (
            <div className="space-y-4">
              {stockItems.map((item, index) => (
                <Card key={index} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <FormLabel>Sucursal</FormLabel>
                        <Select
                          disabled={isLoading || sucursales.length === 0}
                          value={String(item.branch_id || '')}
                          onValueChange={(value) => {
                            actualizarStockItem(index, 'branch_id', parseInt(value))
                          }}
                        >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Selecciona sucursal" />
                            </SelectTrigger>
                            <SelectContent>
                              {sucursales.length > 0 ? (
                                sucursales
                                  .filter((suc: any) => !stockItems.some(
                                    (si, i) => i !== index && String(si.branch_id) === String(suc.id)
                                  ))
                                  .map((suc: any) => (
                                    <SelectItem key={suc.id} value={String(suc.id)}>
                                      {suc.name}
                                    </SelectItem>
                                  ))
                              ) : (
                                <div className="p-2 text-sm text-center text-muted-foreground">
                                  No hay sucursales disponibles
                                </div>
                              )}
                            </SelectContent>
                          </Select>
                      </div>
                      
                      <div>
                        <FormLabel>Cantidad</FormLabel>
                        <Input
                          type="number"
                          value={item.qty_on_hand}
                          onChange={(e) => 
                            actualizarStockItem(
                              index, 
                              'qty_on_hand', 
                              parseFloat(e.target.value) || 0
                            )
                          }
                        />
                      </div>
                      
                      <div>
                        <FormLabel>Costo Unitario</FormLabel>
                        <div className="flex items-center space-x-2">
                          <Input
                            type="number"
                            step="0.01"
                            value={item.avg_cost}
                            onChange={(e) => 
                              actualizarStockItem(
                                index, 
                                'avg_cost', 
                                parseFloat(e.target.value) || 0
                              )
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => eliminarStockItem(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center p-4 border border-dashed rounded-md">
              <p className="text-sm text-muted-foreground">No se ha agregado stock inicial</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
