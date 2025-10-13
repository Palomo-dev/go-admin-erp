'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  FileText, 
  ArrowLeft, 
  Calendar, 
  User, 
  CreditCard, 
  Receipt, 
  Info,
  FileEdit,
  FileOutput,
  CheckCircle,
  Mail,
  Send,
  Download,
  Printer
} from 'lucide-react';
import { 
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '@/utils/Utils';
import { ItemsDetalle } from './ItemsDetalle';
import { PagosDetalle } from './PagosDetalle';
import { RegistrarPagoDialog } from './RegistrarPagoDialog';
import { NotaCreditoDialog } from './NotaCreditoDialog';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';

// Mapeo de estados a colores de badge
const estadoColors: Record<string, string> = {
  'draft': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  'issued': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  'paid': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  'partial': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  'void': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
};

// Función para obtener el texto del estado en español
const getEstadoText = (estado: string): string => {
  const estadoMap: Record<string, string> = {
    'draft': 'Borrador',
    'issued': 'Emitida',
    'void': 'Anulada',
    'paid': 'Pagada',
    'partial': 'Pago Parcial',
    'overdue': 'Vencida'
  };
  
  return estadoMap[estado] || estado;
};

// Función para traducir el método de pago a español
const traducirMetodoPago = (metodo: string | null): string => {
  if (!metodo) return 'N/A';
  
  const metodosMap: Record<string, string> = {
    'cash': 'Efectivo',
    'credit_card': 'Tarjeta de Crédito',
    'debit_card': 'Tarjeta de Débito',
    'bank_transfer': 'Transferencia Bancaria',
    'check': 'Cheque',
    'paypal': 'PayPal',
    'other': 'Otro'
  };
  
  return metodosMap[metodo.toLowerCase()] || metodo;
};

export default function DetalleFactura({ factura }: { factura: any }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPaid, setIsPaid] = useState(factura.status === 'paid');
  const [dialogPagoOpen, setDialogPagoOpen] = useState(false);
  const [dialogNotaCreditoOpen, setDialogNotaCreditoOpen] = useState(false);
  const [facturaActual, setFacturaActual] = useState(factura);
  const [pagosActuales, setPagosActuales] = useState(factura.pagos);

  // Función para actualizar los pagos después de registrar uno nuevo usando RPC unificado
  const actualizarPagos = useCallback(async () => {
    try {
      // Obtener factura actualizada
      const { data: facturaData, error: facturaError } = await supabase
        .from('invoice_sales')
        .select('*')
        .eq('id', facturaActual.id)
        .single();
      
      if (facturaError) throw facturaError;
      if (facturaData) setFacturaActual(facturaData);
      
      // Obtener pagos actualizados usando el RPC unificado
      const organizacion = obtenerOrganizacionActiva();
      if (!organizacion?.id) {
        console.error('No se pudo obtener la organización activa');
        return;
      }

      const { data: pagosData, error: pagosError } = await supabase
        .rpc('get_invoice_payments', {
          target_invoice_id: facturaActual.id,
          org_id: organizacion.id
        });
      
      if (pagosError) {
        console.error('Error al cargar pagos:', pagosError);
        return;
      }
      
      setPagosActuales(pagosData || []);
      console.log('✅ Pagos actualizados:', pagosData?.length || 0);
      
      // Actualizar estado de pago
      setIsPaid(facturaData?.status === 'paid');
      
    } catch (error: any) {
      console.error('Error al actualizar datos:', error);
    }
  }, [facturaActual.id]);

  // Cargar pagos al montar el componente
  useEffect(() => {
    actualizarPagos();
  }, [actualizarPagos]);

  const getBadgeVariant = (status: string) => {
    switch (status) {
      case 'draft': return 'secondary';
      case 'issued': return 'outline';
      case 'paid': return 'success';
      case 'partial': return 'warning';
      case 'void': return 'destructive';
      default: return 'default';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'draft': return 'Borrador';
      case 'issued': return 'Emitida';
      case 'paid': return 'Pagada';
      case 'partial': return 'Pago Parcial';
      case 'void': return 'Anulada';
      default: return status;
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'PPP', { locale: es });
    } catch (error) {
      return 'Fecha inválida';
    }
  };

  // Función para marcar la factura como pagada totalmente
  const marcarComoPagada = async () => {
    try {
      // Verificar si la factura ya tiene un sale_id asociado
      if (!facturaActual.sale_id) {
        // Crear un registro de venta si no existe
        const { data: saleData, error: saleError } = await supabase
          .from('sales')
          .insert({
            organization_id: facturaActual.organization_id,
            branch_id: facturaActual.branch_id,
            customer_id: facturaActual.customer_id,
            total: facturaActual.total,
            balance: 0,  // Se marca con saldo 0 ya que se pagará completamente
            status: 'completed',
            payment_status: 'paid',
            sale_date: new Date().toISOString(),
            notes: `Venta automática generada desde factura ${facturaActual.number}`,
            tax_total: facturaActual.tax_total,
            subtotal: facturaActual.subtotal,
            discount_total: 0
          })
          .select('id')
          .single();

        if (saleError) throw saleError;
        
        // Actualizar la factura con el nuevo sale_id y marcarla como pagada
        const { error } = await supabase
          .from('invoice_sales')
          .update({
            sale_id: saleData.id,
            balance: 0,
            status: 'paid'
          })
          .eq('id', facturaActual.id);
            
        if (error) throw error;
      } else {
        // Si ya existe un sale_id, solo actualizar el estado de la factura
        const { error } = await supabase
          .from('invoice_sales')
          .update({
            balance: 0,
            status: 'paid'
          })
          .eq('id', facturaActual.id);
            
        if (error) throw error;
      }
      
      // Obtener el usuario actual
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      
      // Crear un registro de pago automático
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          organization_id: facturaActual.organization_id,
          branch_id: facturaActual.branch_id,
          source: 'invoice_sales',
          source_id: facturaActual.id,
          method: 'cash', // Efectivo por defecto
          amount: facturaActual.balance,
          currency: facturaActual.currency || 'COP',
          reference: 'Pago total automático',
          status: 'completed',
          created_by: user?.id // Agregar el ID del usuario que creó el pago
        });
        
      if (paymentError) throw paymentError;
      
      // Obtener los pagos actualizados inmediatamente después de crear uno nuevo
      const { data: pagosActualizados, error: pagosError } = await supabase
        .from('payments')
        .select('*')
        .eq('source', 'invoice_sales')
        .eq('source_id', facturaActual.id)
        .order('created_at', { ascending: false });
        
      if (pagosError) throw pagosError;
      
      // Actualizar estado en el componente
      setFacturaActual({
        ...facturaActual,
        status: 'paid',
        balance: 0
      });
      setIsPaid(true);
      
      // Actualizar la lista de pagos con los nuevos datos
      if (pagosActualizados) {
        setPagosActuales(pagosActualizados);
      } else {
        // Si por alguna razón no se obtuvieron datos, llamar al método general
        actualizarPagos();
      }
      
      toast({
        title: "Factura pagada",
        description: "La factura ha sido marcada como pagada exitosamente.",
      });
    } catch (error: any) {
      console.error('Error al marcar como pagada:', error);
      toast({
        title: "Error",
        description: error.message || "Ocurrió un error inesperado",
        variant: "destructive",
      });
    }
  };



  // Funciones para enviar la factura por diferentes medios
  const enviarPorEmail = () => {
    toast({
      title: 'Enviando factura',
      description: `La factura ${facturaActual.number} será enviada por email al cliente.`,
    });
  };

  const enviarPorWhatsApp = () => {
    toast({
      title: 'Enviando factura',
      description: `La factura ${facturaActual.number} será enviada por WhatsApp al cliente.`,
    });
  };

  const generarPDF = () => {
    toast({
      title: 'Generando PDF',
      description: `El PDF de la factura ${facturaActual.number} se está descargando.`,
    });
  };
  
  // Calcular el saldo pendiente
  const saldoPendiente = factura.balance || 0;
  
  // Determinar si la factura está completamente pagada
  const isPagada = factura.status === 'paid';
  
  // Determinar si la factura está en estado borrador
  const isDraft = factura.status === 'draft';
  
  // Función para emitir la factura (cambiar de draft a issued)
  const emitirFactura = async () => {
    try {
      // Llamamos a la función RPC para emitir la factura
      const { data, error } = await supabase
        .rpc('issue_invoice', { invoice_id_param: factura.id });
        
      if (error) throw error;
      
      // Actualizamos la factura en el estado local
      setFacturaActual({
        ...facturaActual,
        status: 'issued'
      });
      
      toast({
        title: "Factura emitida",
        description: "La factura ha sido emitida exitosamente.",
      });
      
      // Recargamos los datos para mostrar la información actualizada
      actualizarPagos();
      
    } catch (error: any) {
      console.error('Error al emitir la factura:', error);
      toast({
        title: "Error",
        description: error.message || "Ocurrió un error al emitir la factura",
        variant: "destructive",
      });
    }
  };
  
  // Manejar la navegación de regreso
  const handleBack = () => {
    router.back();
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Cabecera con botón de regreso */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Button 
            variant="ghost" 
            onClick={handleBack}
            className="p-0 h-auto hover:bg-transparent dark:hover:bg-transparent"
          >
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2 text-blue-600 dark:text-blue-400" />
          </Button>
          <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
            Factura #{factura.number}
          </h1>
          <Badge variant={getBadgeVariant(facturaActual.status)} className="text-xs sm:text-sm py-1 px-2 sm:py-1.5 sm:px-3">
            {getStatusText(facturaActual.status)}
          </Badge>
        </div>
        
        <div className="flex gap-1.5 sm:gap-2 flex-wrap w-full sm:w-auto">
          {isDraft && (
            <Button 
              variant="default" 
              size="sm"
              onClick={emitirFactura}
              className="flex items-center gap-1 h-8 px-2 sm:px-3 text-xs bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              <Send className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Emitir</span>
            </Button>
          )}
          {!isDraft && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={generarPDF}
              className="flex items-center gap-1 h-8 px-2 sm:px-3 text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-100"
            >
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Imprimir</span>
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm"
            onClick={generarPDF}
            className="flex items-center gap-1 h-8 px-2 sm:px-3 text-xs dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            title="Descargar PDF"
          >
            <Download size={14} />
            <span className="hidden sm:inline">PDF</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={enviarPorEmail}
            className="flex items-center gap-1 h-8 px-2 sm:px-3 text-xs dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            title="Enviar por Email"
          >
            <Mail size={14} />
            <span className="hidden sm:inline">Email</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={enviarPorWhatsApp}
            className="flex items-center gap-1 h-8 px-2 sm:px-3 text-xs dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            title="Enviar por WhatsApp"
          >
            <Send size={14} />
            <span className="hidden sm:inline">WhatsApp</span>
          </Button>
          
          {facturaActual.status !== 'paid' && facturaActual.status !== 'void' && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="border-blue-500 text-blue-500 hover:text-blue-600 hover:border-blue-600 dark:border-blue-400 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:border-blue-300 h-8 px-2 sm:px-3 text-xs"
                onClick={() => setDialogNotaCreditoOpen(true)}
              >
                <FileOutput className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden md:inline">Nota Crédito</span>
              </Button>
              <Button 
                onClick={() => {
                  console.log("Abriendo diálogo de pago", facturaActual);
                  setDialogPagoOpen(true);
                }}
                size="sm"
                className="bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 h-8 px-2 sm:px-3 text-xs"
              >
                <CreditCard className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden md:inline">Registrar Abono</span>
              </Button>
              <Button 
                onClick={marcarComoPagada}
                variant="outline"
                size="sm"
                className="flex items-center gap-1 h-8 px-2 sm:px-3 text-xs dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                <span className="hidden lg:inline">Marcar Pagada</span>
              </Button>
            </>
          )}
        </div>
      </div>
      
      {/* Información de la factura */}
      <Card className="col-span-2">
        <CardHeader className="pb-3 sm:pb-6">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Info className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
            <span className="text-gray-900 dark:text-gray-100">Información de la Factura</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2 sm:space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2">
                <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium sm:w-36">Número:</span>
                <span className="text-sm sm:text-base text-gray-900 dark:text-gray-100 font-medium">{factura.number}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2">
                <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium sm:w-36">Cliente:</span>
                <span className="text-sm sm:text-base text-gray-900 dark:text-gray-100">{factura.customers?.full_name || 'N/A'}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2">
                <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium sm:w-36">Email:</span>
                <span className="text-sm sm:text-base text-gray-900 dark:text-gray-100 break-all">{factura.customers?.email || 'N/A'}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2">
                <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium sm:w-36">Teléfono:</span>
                <span className="text-sm sm:text-base text-gray-900 dark:text-gray-100">{factura.customers?.phone || 'N/A'}</span>
              </div>
            </div>
            <div className="space-y-2 sm:space-y-3 pt-3 sm:pt-0 border-t sm:border-t-0 md:border-l md:pl-4">
              <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2">
                <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium sm:w-40">Fecha de Emisión:</span>
                <span className="text-sm sm:text-base text-gray-900 dark:text-gray-100">
                  {factura.issue_date ? formatDate(factura.issue_date) : 'N/A'}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2">
                <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium sm:w-40">Fecha de Vencimiento:</span>
                <span className="text-sm sm:text-base text-gray-900 dark:text-gray-100">
                  {factura.due_date ? formatDate(factura.due_date) : 'N/A'}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2">
                <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium sm:w-40">Método de Pago:</span>
                <span className="text-sm sm:text-base text-gray-900 dark:text-gray-100">{traducirMetodoPago(factura.payment_method)}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2">
                <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium sm:w-40">Términos de Pago:</span>
                <span className="text-sm sm:text-base text-gray-900 dark:text-gray-100">
                  {factura.payment_terms !== null && factura.payment_terms !== undefined ? 
                    factura.payment_terms === 0 ? 'Contado' : 
                    (() => {
                      if (factura.issue_date && factura.payment_terms > 0) {
                        const fechaEmision = new Date(factura.issue_date);
                        const fechaVencimiento = new Date(fechaEmision);
                        fechaVencimiento.setDate(fechaVencimiento.getDate() + factura.payment_terms);
                        const hoy = new Date();
                        const diasRestantes = Math.ceil((fechaVencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
                        
                        return `${factura.payment_terms} días ${diasRestantes > 0 ? 
                          `(${diasRestantes} días restantes)` : 
                          diasRestantes === 0 ? '(vence hoy)' : 
                          `(vencido hace ${Math.abs(diasRestantes)} días)`}`;
                      }
                      return `${factura.payment_terms} días`;
                    })() 
                    : 'N/A'}
                </span>
              </div>
            </div>
          </div>
          
          {factura.notes && (
            <div className="mt-3 sm:mt-4">
              <h4 className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-1 sm:mb-2">Notas:</h4>
              <p className="text-xs sm:text-sm text-gray-900 dark:text-gray-100 p-2 sm:p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                {factura.notes}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Resumen financiero */}
      <Card>
        <CardHeader className="pb-3 sm:pb-6">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Receipt className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
            <span className="text-gray-900 dark:text-gray-100">Resumen Financiero</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2 sm:space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Subtotal:</span>
              <span className="text-sm sm:text-base font-medium text-gray-900 dark:text-gray-100">{formatCurrency(factura.subtotal || 0)}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Impuestos:</span>
              <span className="text-sm sm:text-base font-medium text-gray-900 dark:text-gray-100">{formatCurrency(factura.tax_total || 0)}</span>
            </div>
            
            <Separator className="dark:bg-gray-700" />
            
            <div className="flex justify-between items-center">
              <span className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">Total:</span>
              <span className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(factura.total || 0)}</span>
            </div>
            
            <Separator className="dark:bg-gray-700" />
            
            <div className="flex justify-between items-center">
              <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Pagado:</span>
              <span className="text-sm sm:text-base font-semibold text-green-600 dark:text-green-400">
                {formatCurrency((factura.total || 0) - (factura.balance || 0))}
              </span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Pendiente:</span>
              <span className={`text-sm sm:text-base font-semibold ${saldoPendiente > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {formatCurrency(saldoPendiente)}
              </span>
            </div>
            
            {isPagada && (
              <div className="mt-3 sm:mt-4 bg-green-50 dark:bg-green-900/20 p-2 sm:p-3 rounded-md flex items-center gap-2 border border-green-200 dark:border-green-800">
                <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                <span className="text-green-700 dark:text-green-300 text-xs sm:text-sm font-medium">Factura completamente pagada</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Sección de items */}
      <Card>
        <CardHeader className="pb-3 sm:pb-6">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
            <span className="text-gray-900 dark:text-gray-100">Detalle de Items</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ItemsDetalle items={factura.items} />
        </CardContent>
      </Card>
      
      {/* Sección de pagos */}
      <Card>
        <CardHeader className="pb-3 sm:pb-6">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
            <span className="text-gray-900 dark:text-gray-100">Pagos Aplicados</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <PagosDetalle pagos={pagosActuales} />
        </CardContent>
      </Card>
      
      {/* Diálogos para registrar pago y generar nota de crédito */}
      <RegistrarPagoDialog 
        open={dialogPagoOpen}
        onOpenChange={setDialogPagoOpen}
        factura={facturaActual}
        onSuccess={actualizarPagos}
      />
      
      {/* Diálogo para crear nota de crédito */}
      <NotaCreditoDialog 
        open={dialogNotaCreditoOpen} 
        onOpenChange={setDialogNotaCreditoOpen}
        factura={facturaActual}
        items={factura.items || []}
        onSuccess={() => {
          // Recargar la página para reflejar los cambios
          router.refresh();
        }}
      />
    </div>
  );
}
