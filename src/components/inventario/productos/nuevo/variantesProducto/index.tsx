"use client"

import { useState, useEffect, forwardRef, useImperativeHandle, ForwardRefRenderFunction } from 'react'
import { supabase } from '@/lib/supabase/config'
import toast from 'react-hot-toast'
import { getOrganizationId } from '@/lib/utils/useOrganizacion'

import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"

import { VariantesRef, VariantType, VariantCombination, VariantAttribute, VariantesProps } from './types'
// Importaciones de componentes
import { SelectorTipoVariante } from './SelectorTipoVariante'
import { ListaTiposVariante } from './ListaTiposVariante'
import { ModalNuevoTipo } from './ModalNuevoTipo'
import { TablaVariantes } from './TablaVariantes'

const Variantes: ForwardRefRenderFunction<VariantesRef, VariantesProps> = (props, ref) => {
  const { defaultCost = 0, defaultPrice = 0, defaultSku = '', stockInicial = [] } = props
  // Estados del componente
  const [isLoading, setIsLoading] = useState(true)
  const [variantTypes, setVariantTypes] = useState<VariantType[]>([])
  const [variantCombinations, setVariantCombinations] = useState<VariantCombination[]>([])
  const [selectedVariantTypes, setSelectedVariantTypes] = useState<VariantType[]>([])
  const [showVariantes, setShowVariantes] = useState(false)
  const [showNewTypeModal, setShowNewTypeModal] = useState(false)
  const [organizationId, setOrganizationId] = useState<number | null>(null)

  // Inicializar organization_id al montar el componente y cargar tipos de variantes
  useEffect(() => {
    const orgId = getOrganizationId()
    setOrganizationId(orgId)
    console.log('Variantes usando organization_id:', orgId)
    
    // Cargar los tipos de variantes inmediatamente después de obtener la organización
    const cargarTipos = async () => {
      try {
        await cargarTiposVariantes(orgId)
      } catch (error) {
        console.error('Error al cargar tipos de variantes:', error)
      }
    }
    
    cargarTipos()
  }, [])

  // Exponer métodos al componente padre usando useImperativeHandle
  useImperativeHandle(ref, () => ({
    getVariantes: () => variantCombinations
  }))

  // Función para cargar tipos de variantes disponibles
  const cargarTiposVariantes = async (idOrg?: number) => {
    // Usar el ID proporcionado o el del estado
    const orgId = idOrg || organizationId
    
    if (!orgId) {
      console.error('No se ha podido obtener el ID de la organización')
      toast.error('Error al cargar tipos de variantes: falta ID de organización')
      setIsLoading(false)
      return
    }
    
    setIsLoading(true)
    
    // Establecer un tiempo máximo para la carga
    const timeoutId = setTimeout(() => {
      console.warn('Tiempo de carga excedido, desactivando estado de carga')
      setIsLoading(false)
    }, 5000) // 5 segundos máximo
    
    try {
      // Eliminado console.log para reducir ruido
      const { data, error } = await supabase
        .from('variant_types')
        .select(`
          id,
          name,
          organization_id,
          variant_values (
            id,
            value,
            display_order
          )
        `)
        .or(`organization_id.eq.${orgId},organization_id.eq.0`)
        .order('name')

      // Limpiar el temporizador ya que la consulta ha terminado
      clearTimeout(timeoutId)
      
      if (error) {
        console.error('Error al cargar tipos de variante:', error)
        toast.error('No se pudieron cargar los tipos de variante')
        throw error
      }

      // Eliminado console.log para reducir ruido
      if (data && data.length > 0) {
        // Verificar si hay tipos sin valores
        const tiposSinValores = data.filter(tipo => 
          !tipo.variant_values || tipo.variant_values.length === 0
        ).map(tipo => tipo.name)
        
        // Eliminado console.warn para reducir ruido
        
        // Procesar los resultados, asegurándose de que los valores estén ordenados
        const tiposConValores = data
          // Filtrar tipos que tienen valores (no mostrar tipos sin valores disponibles)
          .filter(tipo => tipo.variant_values && tipo.variant_values.length > 0)
          .map(tipo => {
            // Ordenar los valores por display_order
            const valoresOrdenados = Array.isArray(tipo.variant_values) 
              ? [...tipo.variant_values].sort((a, b) => a.display_order - b.display_order) 
              : [];
            
            return {
              ...tipo,
              variant_values: valoresOrdenados,
              // Asignar también a values para que la UI pueda usarlo
              values: valoresOrdenados
            };
          })
        
        // Eliminado console.log para reducir ruido
        // Forzar actualización del estado
        setVariantTypes([])
        setTimeout(() => {
          setVariantTypes(tiposConValores)
        }, 50)
      } else {
        console.warn('No se encontraron tipos de variante')
        setVariantTypes([])
      }
    } catch (error) {
      console.error('Error al cargar tipos de variantes:', error)
      toast.error('No se pudieron cargar los tipos de variantes')
    } finally {
      clearTimeout(timeoutId) // Asegurarse de limpiar el temporizador
      setIsLoading(false)
    }
  }
    
  // Cargar tipos de variantes al iniciar el componente o cuando cambia el organizationId
  useEffect(() => {
    if (organizationId) {
      cargarTiposVariantes()
    }
  }, [organizationId])
  
  // Función para abrir el modal de nuevo tipo
  const abrirModalNuevoTipo = () => {
    setShowNewTypeModal(true)
  }

  const agregarTipoVariante = (tipoId: string) => {
    console.log('Agregando tipo de variante con ID:', tipoId)
    
    // Comprobar si ya está seleccionado
    if (selectedVariantTypes.some(t => t.id === Number(tipoId))) {
      toast.error('Este tipo de variante ya está añadido')
      return
    }
    
    // Buscar el tipo seleccionado entre los disponibles
    const tipoSeleccionado = variantTypes.find(t => t.id === Number(tipoId))
    if (!tipoSeleccionado) {
      toast.error('No se encontró el tipo de variante seleccionado')
      return
    }
    
    // Añadir a los tipos seleccionados
    const nuevoTipo = {
      ...tipoSeleccionado,
      selectedValues: [] // Ningún valor seleccionado inicialmente
    }
    
    const nuevosSeleccionados = [...selectedVariantTypes, nuevoTipo]
    setSelectedVariantTypes(nuevosSeleccionados)
    
    // Regenerar combinaciones si ya había otros tipos seleccionados
    if (selectedVariantTypes.length > 0) {
      regenerarCombinaciones(nuevosSeleccionados)
    }
  }

  const eliminarTipoVariante = (index: number) => {
    const nuevosSeleccionados = [...selectedVariantTypes]
    nuevosSeleccionados.splice(index, 1)
    setSelectedVariantTypes(nuevosSeleccionados)
    regenerarCombinaciones(nuevosSeleccionados)
  }

  const toggleValorVariante = (tipoIndex: number, valorId: number | string) => {
    const tiposActualizados = [...selectedVariantTypes]
    const tipoActual = tiposActualizados[tipoIndex]
    
    // Inicializar selectedValues si no existe
    if (!tipoActual.selectedValues) {
      tipoActual.selectedValues = []
    }
    
    // Comprobar si el valor ya está seleccionado
    const valorIndex = tipoActual.selectedValues.findIndex((v: number) => v === Number(valorId))
    
    if (valorIndex >= 0) {
      // Si está seleccionado, lo eliminamos
      tipoActual.selectedValues = tipoActual.selectedValues.filter((v: number) => v !== Number(valorId))
    } else {
      // Si no está seleccionado, lo agregamos
      tipoActual.selectedValues = [...tipoActual.selectedValues, Number(valorId)]
    }
    
    setSelectedVariantTypes(tiposActualizados)
    regenerarCombinaciones(tiposActualizados)
  }

  const regenerarCombinaciones = (tiposSeleccionados: VariantType[]) => {
    if (tiposSeleccionados.length === 0) {
      setVariantCombinations([])
      return
    }
  
    // Filtrar solo los tipos que tienen valores seleccionados
    const tiposConValores = tiposSeleccionados.filter(tipo => 
      tipo.selectedValues && tipo.selectedValues.length > 0
    )
    
    if (tiposConValores.length === 0) {
      setVariantCombinations([])
      return
    }
  
    // Estructura para almacenar las combinaciones de atributos
    const combinacionesAtributos: VariantAttribute[][] = []
  
    function generarCombinacion(tipoIndex: number, combinacionActual: VariantAttribute[]) {
      // Si hemos procesado todos los tipos, guardar la combinación
      if (tipoIndex >= tiposConValores.length) {
        combinacionesAtributos.push(combinacionActual)
        return
      }
  
      // Obtener el tipo actual y sus valores seleccionados
      const tipoActual = tiposConValores[tipoIndex]
      const valoresSeleccionados = tipoActual.selectedValues || []
      
      // Para cada valor seleccionado, crear una nueva rama de combinaciones
      valoresSeleccionados.forEach((valorId: number) => {
        const valor = tipoActual.variant_values.find(v => v.id === valorId)
        if (valor) {
          const atributo: VariantAttribute = {
            type_id: tipoActual.id,
            type_name: tipoActual.name,
            value_id: valor.id,
            value: valor.value
          }
          generarCombinacion(tipoIndex + 1, [...combinacionActual, atributo])
        }
      })
    }
    
    // Iniciar la generación de combinaciones con el primer tipo
    generarCombinacion(0, [])
    
    // Convertir las combinaciones de atributos a VariantCombination
    const nuevasCombinaciones: VariantCombination[] = combinacionesAtributos.map(attrs => {
      // Generar un SKU para la variante basado en el SKU principal + valores de atributos
      const sufijo = attrs
        .map(attr => attr.value.substring(0, 3).toUpperCase())
        .join('-');
      const skuVariante = defaultSku ? `${defaultSku}-${sufijo}` : sufijo;
  
      // Crear objeto de stock por sucursal similar al principal si está disponible
      const stockPorSucursal = stockInicial && stockInicial.length > 0
        ? stockInicial.map(item => ({
            branch_id: item.branch_id,
            qty_on_hand: item.qty_on_hand,
            avg_cost: item.avg_cost
          }))
        : [];
        
      return {
        sku: skuVariante,
        price: defaultPrice, // Usar el precio del formulario principal
        cost: defaultCost,   // Usar el costo del formulario principal
        stock_quantity: 0,
        stock_por_sucursal: stockPorSucursal,
        attributes: attrs
      };
    });
    
    setVariantCombinations(nuevasCombinaciones)
  }

const actualizarCampoVariante = (index: number, campo: keyof VariantCombination, valor: any) => {
  const nuevasCombinaciones = [...variantCombinations]
  if (index >= 0 && index < nuevasCombinaciones.length) {
    nuevasCombinaciones[index] = {
      ...nuevasCombinaciones[index],
      [campo]: valor
    }
    setVariantCombinations(nuevasCombinaciones)
  }
}

  // Generar un SKU basado en el SKU base y la combinación
  const generarSkus = (skuBase: string) => {
    const nuevasCombinaciones = variantCombinations.map(comb => {
      // Crear un sufijo a partir de los valores de la variante
      const sufijo = comb.attributes
        .map(attr => attr.value.substring(0, 3).toUpperCase())
        .join('-')
      
      return {
        ...comb,
        sku: `${skuBase}-${sufijo}`
      }
    })
    
    setVariantCombinations(nuevasCombinaciones)
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium dark:text-gray-100 light:text-gray-900">Variantes</h3>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setShowVariantes(!showVariantes)}
            className="dark:text-gray-300 dark:hover:text-white light:text-gray-600 light:hover:text-gray-900"
          >
            {showVariantes ? 'Ocultar' : 'Mostrar'} opciones de variantes
          </Button>
        </div>
        
        {showVariantes && (
          <div>
            <SelectorTipoVariante 
              isLoading={isLoading}
              variantTypes={variantTypes}
              selectedVariantTypes={selectedVariantTypes}
              onSelectType={agregarTipoVariante}
              onNewType={abrirModalNuevoTipo}
            />

            {selectedVariantTypes.length > 0 && (
              <ListaTiposVariante 
                selectedVariantTypes={selectedVariantTypes}
                onRemoveType={eliminarTipoVariante}
                onToggleValue={toggleValorVariante}
                onUpdateTypes={setSelectedVariantTypes}
                reloadTypes={cargarTiposVariantes}
              />
            )}
          </div>
        )}
        
        {/* Tabla de combinaciones de variantes */}
        {variantCombinations.length > 0 && (
          <div className="mt-6">
            <h4 className="text-md font-medium mb-3 dark:text-gray-100 light:text-gray-900">
              Combinaciones de variantes ({variantCombinations.length})
            </h4>
            <TablaVariantes 
              variantCombinations={variantCombinations}
              selectedVariantTypes={selectedVariantTypes}
              onUpdateCombinations={setVariantCombinations}
            />
          </div>
        )}
      </div>
      
      {/* Modal para crear nuevo tipo de variante */}
      {showNewTypeModal && organizationId && (
        <ModalNuevoTipo 
          isOpen={showNewTypeModal}
          organizationId={organizationId}
          onClose={() => setShowNewTypeModal(false)}
          onSuccess={cargarTiposVariantes}
        />
      )}
    </>
  )
}

// Crear el componente con forwardRef
const VariantesForwarded = forwardRef(Variantes)

// Asignar nombre para devtools
VariantesForwarded.displayName = 'Variantes'

export default VariantesForwarded
