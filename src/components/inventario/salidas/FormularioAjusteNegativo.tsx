'use client'

import { useState, useEffect, FocusEvent } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase/config'
import { useToast } from '@/components/ui/use-toast'
import { formatDate, handleNumericInput } from '@/utils/Utils'
import TablaProductosSalida from './TablaProductosSalida'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PDFViewer, PDFDownloadLink, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

interface Sucursal {
  id: number
  name: string
}

interface ProductoSalida {
  id: number
  product_id: number
  nombre: string
  sku: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  handleFocus?: (e: FocusEvent<HTMLInputElement>) => void
  handleBlur?: (e: FocusEvent<HTMLInputElement>) => void
  lote_id?: number
  lote_codigo?: string
}

interface FormularioAjusteNegativoProps {
  organizationId: number
}

// PDF Styles
const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: 'Helvetica',
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 10,
  },
  section: {
    marginBottom: 10,
  },
  table: {
    display: 'table',
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  tableRow: { 
    flexDirection: 'row',
  },
  tableCol: { 
    width: '25%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  tableCell: { 
    margin: 5,
    fontSize: 10,
  },
  tableHeader: {
    backgroundColor: '#f0f0f0',
    fontWeight: 'bold',
  },
  text: {
    fontSize: 12,
    marginBottom: 5,
  },
  footer: {
    marginTop: 30,
    textAlign: 'center',
    fontSize: 10,
    color: 'gray',
  },
});

// PDF Document Component
const AjusteComprobantePDF = ({ data, productos, total }: { data: any, productos: ProductoSalida[], total: number }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <Text style={styles.title}>Comprobante de Ajuste de Inventario</Text>
      
      <View style={styles.section}>
        <Text style={styles.subtitle}>Información General</Text>
        <Text style={styles.text}>Tipo de Ajuste: {data.tipo_ajuste}</Text>
        <Text style={styles.text}>Motivo: {data.motivo}</Text>
        <Text style={styles.text}>Fecha: {data.fecha}</Text>
        <Text style={styles.text}>Sucursal: {data.sucursal_nombre}</Text>
        <Text style={styles.text}>Referencia: {data.referencia}</Text>
      </View>
      
      <View style={styles.section}>
        <Text style={styles.subtitle}>Productos</Text>
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>SKU</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Producto</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Cantidad</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Costo Unit.</Text>
            </View>
          </View>
          
          {productos.map((producto: ProductoSalida, i: number) => (
            <View key={i} style={styles.tableRow}>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>{producto.sku}</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>{producto.nombre}</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>{producto.cantidad}</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>${producto.precio_unitario}</Text>
              </View>
            </View>
          ))}
        </View>
        
        <Text style={[styles.text, { marginTop: 10, fontWeight: 'bold' }]}>
          Valor Total: ${total.toFixed(2)}
        </Text>
      </View>
      
      <View style={styles.section}>
        <Text style={styles.subtitle}>Notas</Text>
        <Text style={styles.text}>{data.notas || 'Sin notas adicionales'}</Text>
      </View>
      
      <Text style={styles.footer}>
        Documento generado el {new Date().toLocaleDateString()} a las {new Date().toLocaleTimeString()}
      </Text>
    </Page>
  </Document>
);

export default function FormularioAjusteNegativo({ organizationId }: FormularioAjusteNegativoProps) {
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [motivos, setMotivos] = useState(['Merma', 'Obsequio', 'Pérdida', 'Daño', 'Vencimiento', 'Otro'])
  const [productos, setProductos] = useState<ProductoSalida[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showPdfPreview, setShowPdfPreview] = useState(false)
  const [comprobantePDF, setComprobantePDF] = useState<any>(null)
  const { toast } = useToast()

  const [formData, setFormData] = useState({
    tipo_ajuste: 'Merma',
    motivo: 'Merma',
    sucursal_id: '',
    sucursal_nombre: '',
    referencia: '',
    fecha: formatDate(new Date().toISOString(), 'yyyy-MM-dd'),
    notas: '',
    generar_pdf: true
  })

  useEffect(() => {
    const cargarSucursales = async () => {
      try {
        const { data, error } = await supabase
          .from('branches')
          .select('id, name')
          .eq('organization_id', organizationId)
          .order('name')

        if (error) throw error
        setSucursales(data || [])
      } catch (error) {
        console.error('Error al cargar sucursales:', error)
      }
    }

    setIsLoading(true)
    cargarSucursales()
      .finally(() => setIsLoading(false))
  }, [organizationId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (name: string, value: string) => {
    if (name === 'sucursal_id') {
      const sucursal = sucursales.find(s => s.id.toString() === value)
      setFormData(prev => ({ 
        ...prev, 
        [name]: value,
        sucursal_nombre: sucursal ? sucursal.name : ''
      }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  const handleCheckboxChange = (checked: boolean) => {
    setFormData(prev => ({ ...prev, generar_pdf: checked }))
  }

  const handleAddProducto = (producto: ProductoSalida) => {
    setProductos(prev => [...prev, producto])
  }

  const handleRemoveProducto = (index: number) => {
    setProductos(prev => prev.filter((_, i) => i !== index))
  }

  const handleUpdateProducto = (index: number, producto: ProductoSalida) => {
    // Asignar manejadores de eventos para campos numéricos
    producto.handleFocus = (e) => handleNumberFocus(e, e.target.name as keyof ProductoSalida, index);
    producto.handleBlur = (e) => handleNumberBlur(e, e.target.name as keyof ProductoSalida, index);
    
    setProductos(prev => {
      const nuevosProductos = [...prev];
      nuevosProductos[index] = producto;
      return nuevosProductos;
    })
  }

  const handleNumberFocus = (e: FocusEvent<HTMLInputElement>, field: keyof ProductoSalida, index: number) => {
    const value = productos[index][field];
    
    if (value === 0) {
      // Aplicar la regla UX: Cuando se hace focus y el valor es 0, el input se vacía
      e.target.value = '';
      // No es necesario actualizar el estado aquí, solo modificamos la visualización
      // El valor real se actualizará si cambia o cuando pierda el foco
    }
  };

  const handleNumberBlur = (e: FocusEvent<HTMLInputElement>, field: keyof ProductoSalida, index: number) => {
    const inputValue = e.target.value;
    
    if (inputValue === '' || inputValue === null || inputValue === undefined) {
      // Aplicar la regla UX: Cuando se pierde el foco y el campo está vacío, vuelve a 0
      const newProductos = [...productos];
      newProductos[index] = { ...newProductos[index], [field]: 0 };
      
      // Recalcular subtotal si se trata de cantidad o precio_unitario
      if (field === 'cantidad' || field === 'precio_unitario') {
        const producto = newProductos[index];
        producto.subtotal = producto.cantidad * producto.precio_unitario;
      }
      
      setProductos(newProductos);
      e.target.value = '0'; // Asegurar que el input muestra 0
    }
  };

  const calcularTotal = () => {
    return productos.reduce((total, producto) => total + producto.subtotal, 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (productos.length === 0) {
      toast({
        title: "Error",
        description: "Debe agregar al menos un producto al ajuste de inventario.",
        variant: "destructive"
      })
      return
    }

    if (!formData.sucursal_id) {
      toast({
        title: "Error",
        description: "Debe seleccionar una sucursal para el ajuste.",
        variant: "destructive"
      })
      return
    }

    setIsSaving(true)

    try {
      // 1. Crear el ajuste en inventory_adjustments
      const { data: adjustmentData, error: adjustmentError } = await supabase
        .from('inventory_adjustments')
        .insert({
          organization_id: organizationId,
          branch_id: parseInt(formData.sucursal_id),
          type: 'negative', // Ajuste negativo
          reason: formData.motivo,
          status: 'completed',
          notes: formData.notas
        })
        .select()

      if (adjustmentError) throw adjustmentError

      const adjustmentId = adjustmentData[0].id

      // 2. Insertar cada producto como un adjustment_item
      const adjustmentItemsPromises = productos.map(producto => {
        return supabase
          .from('adjustment_items')
          .insert({
            inventory_adjustment_id: adjustmentId,
            product_id: producto.product_id,
            quantity: producto.cantidad,
            lot_id: producto.lote_id || null,
            unit_cost: producto.precio_unitario
          })
      })

      await Promise.all(adjustmentItemsPromises)

      // 3. Registrar los movimientos de stock
      const stockMovementsPromises = productos.map(producto => {
        return supabase
          .from('stock_movements')
          .insert({
            organization_id: organizationId,
            branch_id: parseInt(formData.sucursal_id),
            product_id: producto.product_id,
            lot_id: producto.lote_id || null,
            direction: 'out', // Salida
            qty: producto.cantidad,
            unit_cost: producto.precio_unitario,
            source: 'adjustment',
            source_id: adjustmentId.toString(),
            note: `Ajuste negativo por ${formData.motivo}`
          })
      })

      await Promise.all(stockMovementsPromises)

      // 4. Preparar datos para el comprobante PDF
      if (formData.generar_pdf) {
        // Guardar datos para el PDF y mostrar preview
        const pdfData = {
          ...formData,
          adjustment_id: adjustmentId,
          fecha_emision: new Date().toLocaleString()
        }
        
        setComprobantePDF(pdfData as any)
        setShowPdfPreview(true)
      } else {
        toast({
          title: "Éxito",
          description: "El ajuste de inventario se ha registrado correctamente."
        })

        // Limpiar el formulario
        setFormData({
          tipo_ajuste: 'Merma',
          motivo: 'Merma',
          sucursal_id: '',
          sucursal_nombre: '',
          referencia: '',
          fecha: formatDate(new Date().toISOString(), 'yyyy-MM-dd'),
          notas: '',
          generar_pdf: true
        })
        setProductos([])
      }
    } catch (error) {
      console.error('Error al guardar el ajuste:', error)
      toast({
        title: "Error",
        description: "Ha ocurrido un error al guardar el ajuste. Intente nuevamente.",
        variant: "destructive"
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleClosePdfDialog = () => {
    setShowPdfPreview(false)
    // Limpiar el formulario después de cerrar el diálogo
    setFormData({
      tipo_ajuste: 'Merma',
      motivo: 'Merma',
      sucursal_id: '',
      sucursal_nombre: '',
      referencia: '',
      fecha: formatDate(new Date().toISOString(), 'yyyy-MM-dd'),
      notas: '',
      generar_pdf: true
    })
    setProductos([])

    toast({
      title: "Éxito",
      description: "El ajuste de inventario se ha registrado correctamente."
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tipo_ajuste">Tipo de Ajuste</Label>
            <Select 
              value={formData.tipo_ajuste} 
              onValueChange={(value) => handleSelectChange('tipo_ajuste', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona tipo de ajuste" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Merma">Merma</SelectItem>
                <SelectItem value="Obsequio">Obsequio</SelectItem>
                <SelectItem value="Pérdida">Pérdida</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo</Label>
            <Select 
              value={formData.motivo} 
              onValueChange={(value) => handleSelectChange('motivo', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un motivo" />
              </SelectTrigger>
              <SelectContent>
                {motivos.map((motivo) => (
                  <SelectItem key={motivo} value={motivo}>
                    {motivo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sucursal_id">Sucursal</Label>
            <Select 
              value={formData.sucursal_id} 
              onValueChange={(value) => handleSelectChange('sucursal_id', value)}
              disabled={isLoading || sucursales.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una sucursal" />
              </SelectTrigger>
              <SelectContent>
                {sucursales.map(sucursal => (
                  <SelectItem key={sucursal.id} value={sucursal.id.toString()}>
                    {sucursal.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="referencia">Número de Referencia</Label>
            <Input
              id="referencia"
              name="referencia"
              value={formData.referencia}
              onChange={handleChange}
              placeholder="AJ-0001"
            className="focus:placeholder-transparent"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fecha">Fecha</Label>
            <Input
              id="fecha"
              name="fecha"
              type="date"
              value={formData.fecha}
              onChange={handleChange}
              disabled={isLoading}
            />
          </div>
          
          <div className="flex items-center space-x-2 pt-4">
            <Checkbox 
              id="generar_pdf" 
              checked={formData.generar_pdf} 
              onCheckedChange={handleCheckboxChange}
            />
            <Label htmlFor="generar_pdf">Generar comprobante PDF</Label>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notas">Notas</Label>
        <Textarea
          id="notas"
          name="notas"
          value={formData.notas}
          onChange={handleChange}
          placeholder="Información adicional sobre el ajuste..."
          rows={3}
          disabled={isLoading}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <TablaProductosSalida
            productos={productos}
            onAddProducto={handleAddProducto}
            onRemoveProducto={handleRemoveProducto}
            onUpdateProducto={handleUpdateProducto}
            organizationId={organizationId}
          />
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <div className="text-lg font-bold">
          Total: ${calcularTotal().toFixed(2)}
        </div>
        <div className="flex gap-4">
          <Button type="button" variant="outline">
            Cancelar
          </Button>
          <Button type="submit" disabled={isLoading || isSaving || productos.length === 0}>
            {isSaving ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Guardando...
              </>
            ) : (
              'Registrar Ajuste'
            )}
          </Button>
        </div>
      </div>

      {/* Diálogo para mostrar el PDF */}
      <Dialog open={showPdfPreview} onOpenChange={setShowPdfPreview}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Comprobante de Ajuste de Inventario</DialogTitle>
            <DialogDescription>
              El ajuste ha sido registrado exitosamente. Puede descargar el comprobante.
            </DialogDescription>
          </DialogHeader>
          
          <div className="h-[500px] w-full border rounded">
            {comprobantePDF && (
              <PDFViewer width="100%" height="100%" className="border-0">
                <AjusteComprobantePDF 
                  data={formData}
                  productos={productos}
                  total={calcularTotal()}
                />
              </PDFViewer>
            )}
          </div>
          
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={handleClosePdfDialog}
            >
              Cerrar
            </Button>
            
            {comprobantePDF && (
              <PDFDownloadLink
                document={
                  <AjusteComprobantePDF 
                    data={formData}
                    productos={productos}
                    total={calcularTotal()}
                  />
                }
                fileName={`ajuste-${formData.motivo.toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
              >
                {({ loading }) => (loading ? 'Generando...' : 'Descargar PDF')}
              </PDFDownloadLink>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}
