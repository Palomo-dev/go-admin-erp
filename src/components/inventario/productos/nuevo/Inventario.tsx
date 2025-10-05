"use client"

import { useEffect, useState } from 'react'
import { UseFormReturn } from 'react-hook-form'
import { supabase } from '@/lib/supabase/config'
import { getCurrentBranchId } from '@/lib/hooks/useOrganization'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'

interface InventarioProps {
  form: UseFormReturn<any>
}

type StockItem = {
  branch_id: number | null
  qty_on_hand: number
  avg_cost: number
  qty_reserved?: number
  lot_id?: number | null
}

export default function Inventario({ form }: InventarioProps) {
  const [sucursales, setSucursales] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [stockItems, setStockItems] = useState<StockItem[]>([])

  // Sincronizar el estado local con los datos del formulario cuando ya existen
  useEffect(() => {
    const stockInicial = form.getValues('stock_inicial');
    if (stockInicial && Array.isArray(stockInicial) && stockInicial.length > 0) {
      console.log("Stock inicial detectado en el formulario:", stockInicial);
      setStockItems(stockInicial);
    }
  }, [form]);

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
          let { data, error } = await supabase
            .from('branches')
            .select('id, name')
            .eq('organization_id', organization_id)
            .eq('is_active', true)
            .order('name')
          
          if (error) throw error;
          
          if (!data || data.length === 0) {
            const respuesta = await supabase
              .from('branches')
              .select('id, name')
              .eq('organization_id', 2)
              .eq('is_active', true)
              .order('name')
            
            data = respuesta.data || []
          }
          
          setSucursales(data || [])
        } else {
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
    // Obtener la sucursal actual del usuario
    const currentBranchId = getCurrentBranchId();
    
    // Si no hay sucursal actual, usar la primera sucursal disponible como fallback
    const defaultBranchId = currentBranchId || (sucursales.length > 0 ? sucursales[0].id : null);
    
    const nuevoItem: StockItem = {
      branch_id: defaultBranchId,
      qty_on_hand: 0,
      avg_cost: form.getValues('cost') || 0,
      qty_reserved: 0,
      lot_id: null
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
    nuevosItems[index][campo as keyof StockItem] = valor
    setStockItems(nuevosItems)
    form.setValue('stock_inicial', nuevosItems)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Control de Inventario</h3>
      </div>

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
                <SelectItem value="deleted">Eliminado</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      
      {/* Stock inicial */}
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
                              .filter((suc: any) => {
                                return String(item.branch_id) === String(suc.id) || 
                                  !stockItems.some((si, i) => i !== index && String(si.branch_id) === String(suc.id));
                              })
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
          <Card className="mt-2">
            <CardContent className="p-4 text-center text-muted-foreground">
              No hay stock inicial agregado.
              {sucursales.length > 0 ? (
                <div className="mt-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={agregarStockItem}
                  >
                    <PlusCircle className="mr-2 h-4 w-4" /> Agregar Sucursal
                  </Button>
                </div>
              ) : isLoading ? (
                <div className="mt-2 flex justify-center">
                  <Skeleton className="h-8 w-32" />
                </div>
              ) : (
                <div className="mt-2 text-sm">
                  No hay sucursales disponibles.
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
