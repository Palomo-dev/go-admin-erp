"use client"

import { useState, useEffect, forwardRef, useImperativeHandle, ForwardRefRenderFunction } from 'react'
import { supabase } from '@/lib/supabase/config'
import toast from 'react-hot-toast'
import { getOrganizationId } from '@/lib/hooks/useOrganization'

import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"

import { VariantesRef, VariantType, VariantCombination, VariantAttribute, VariantesProps, VariantValue, StockPorSucursal } from './types'
// Importaciones de componentes
import { SelectorTipoVariante } from './SelectorTipoVariante'
import { ListaTiposVariante } from './ListaTiposVariante'
import { ModalNuevoTipo } from './ModalNuevoTipo'
import { TablaVariantes } from './TablaVariantes'

const Variantes: ForwardRefRenderFunction<VariantesRef, VariantesProps> = (props, ref) => {
  const { defaultCost = 0, defaultPrice = 0, defaultSku = '', stockInicial = [], productoId } = props
  // Estados del componente
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingVariants, setIsLoadingVariants] = useState(false)
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
  
  // Cargar variantes existentes si estamos en modo edición
  useEffect(() => {
    const cargarVariantesExistentes = async () => {
      if (!productoId || !organizationId) return;
      
      try {
        setIsLoadingVariants(true);
        
        // 1. Obtener las variantes del producto
        const { data: variants, error } = await supabase
          .from('product_variants')
          .select(`
            id, 
            sku,
            price,
            cost,
            product_id,
            product_variant_attributes (variant_id, variant_type_id, variant_value_id)
          `)
          .eq('product_id', productoId);
        
        if (error) throw error;
        
        if (variants && variants.length > 0) {
          // Necesitamos obtener toda la información de los tipos de variantes y valores
          const tiposYValores = await obtenerTiposYValoresVariantes(variants);
          
          // 2. Establecer los tipos de variante seleccionados
          if (tiposYValores.tiposSeleccionados.length > 0) {
            setSelectedVariantTypes(tiposYValores.tiposSeleccionados);
            setShowVariantes(true);
          }
          
          // 3. Formatear y establecer las combinaciones de variantes
          const combinacionesFormateadas = await formatearVariantes(variants, tiposYValores.mapaTipos, tiposYValores.mapaValores);
          setVariantCombinations(combinacionesFormateadas);
        }
      } catch (error: any) {
        console.error('Error al cargar variantes existentes:', error);
        toast.error('No se pudieron cargar las variantes del producto');
      } finally {
        setIsLoadingVariants(false);
      }
    };
    
    cargarVariantesExistentes();
  }, [productoId, organizationId]);

  // Exponer métodos al componente padre usando useImperativeHandle
  useImperativeHandle(ref, () => ({
    getVariantes: () => variantCombinations
  }))
  
  // Función para obtener información completa de tipos y valores de variantes
  const obtenerTiposYValoresVariantes = async (variants: any[]) => {
    const tipoIds = new Set<number>();
    const valorIds = new Set<number>();
    
    // Recolectar todos los IDs únicos de tipos y valores de variantes
    variants.forEach(variant => {
      if (variant.product_variant_attributes && variant.product_variant_attributes.length > 0) {
        variant.product_variant_attributes.forEach((attr: any) => {
          tipoIds.add(attr.variant_type_id);
          valorIds.add(attr.variant_value_id);
        });
      }
    });
    
    // Consultar todos los tipos de variantes necesarios
    const { data: tiposData } = await supabase
      .from('variant_types')
      .select(`
        id,
        name,
        organization_id,
        variant_values (id, value, display_order)
      `)
      .in('id', Array.from(tipoIds));
    
    // Crear un mapa de tipos y valores para acceso rápido
    const mapaTipos: Record<number, VariantType> = {};
    const mapaValores: Record<number, VariantValue & { type_id: number, type_name: string }> = {};
    
    const tiposSeleccionados: VariantType[] = [];
    
    if (tiposData && tiposData.length > 0) {
      tiposData.forEach(tipo => {
        mapaTipos[tipo.id] = tipo;
        tiposSeleccionados.push({
          ...tipo,
          values: tipo.variant_values,
          selectedValues: tipo.variant_values.map(v => v.id)
        });
        
        tipo.variant_values.forEach(valor => {
          mapaValores[valor.id] = {
            ...valor,
            type_id: tipo.id,
            type_name: tipo.name
          };
        });
      });
    }
    
    return {
      tiposSeleccionados,
      mapaTipos,
      mapaValores
    };
  };
  
  // Función para formatear variantes desde la base de datos al formato interno
  const formatearVariantes = async (variants: any[], mapaTipos: Record<number, VariantType>, mapaValores: Record<number, any>) => {
    // Obtener los niveles de stock para las variantes
    const variantIds = variants.map(v => v.id);
    const { data: stockData } = await supabase
      .from('stock_levels')
      .select('*')
      .in('variant_id', variantIds);
    
    // Crear un mapa de stock por variante
    const stockPorVariante: Record<number, StockPorSucursal[]> = {};
    if (stockData && stockData.length > 0) {
      stockData.forEach((stock: any) => {
        if (!stockPorVariante[stock.variant_id]) {
          stockPorVariante[stock.variant_id] = [];
        }
        stockPorVariante[stock.variant_id].push({
          branch_id: stock.branch_id,
          qty_on_hand: stock.qty_on_hand || 0,
          avg_cost: stock.avg_cost || 0
        });
      });
    }
    
    return variants.map(variant => {
      // Formatear los atributos de la variante
      const attributes: VariantAttribute[] = variant.product_variant_attributes.map((attr: any) => {
        const valor = mapaValores[attr.variant_value_id];
        return {
          type_id: attr.variant_type_id,
          type_name: valor ? valor.type_name : 'Desconocido',
          value_id: attr.variant_value_id,
          value: valor ? valor.value : 'Desconocido'
        };
      });
      
      // Calcular el stock total sumando de todas las sucursales
      const stockVariante = stockPorVariante[variant.id] || [];
      const stockTotal = stockVariante.reduce((sum, item) => sum + (item.qty_on_hand || 0), 0);
      
      return {
        id: variant.id,
        sku: variant.sku,
        price: variant.price || 0,
        cost: variant.cost || 0,
        stock_quantity: stockTotal,
        attributes,
        stock_por_sucursal: stockVariante
      } as VariantCombination;
    });
  };

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
    const nuevasCombinaciones: VariantCombination[] = combinacionesAtributos.map((attrs, index) => {
      // Generar un identificador único basado en los IDs de los valores seleccionados
      const uniqueId = attrs
        .map(attr => attr.value_id.toString())
        .join('');
      
      // Generar un SKU para la variante basado en el SKU principal + valores de atributos + índice para garantizar unicidad
      const sufijo = attrs
        .map(attr => attr.value.substring(0, 3).toUpperCase())
        .join('-');
      
      // Obtener timestamp actual para hacer aún más únicos los SKUs
      const timestamp = Date.now().toString().slice(-4);
      
      // Añadir índice al final para asegurar que sea único incluso con valores similares
      const skuVariante = defaultSku 
        ? `${defaultSku}-${sufijo}-${index + 1}-${timestamp}` 
        : `${sufijo}-${index + 1}-${timestamp}`;
  
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
          <h3 className="text-lg font-medium dark:text-gray-100">Variantes del Producto</h3>
          <div className="flex items-center gap-2">
            {isLoadingVariants && (
              <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Cargando variantes...
              </div>
            )}
            <Button 
              onClick={() => setShowNewTypeModal(true)}
              variant="outline"
              size="sm"
              className="dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-white"
            >
              Nuevo Tipo de Variante
            </Button>
          </div>
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
