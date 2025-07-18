'use client';

import React, { useState, useCallback } from 'react';
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
  Download
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

// Mapeo de estados a colores de badge
const estadoColors: Record<string, string> = {
  'draft': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  'issued': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  'paid': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  'partial': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  'void': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
};

// Función para obtener el texto del estado en español
const getEstadoText = (estado: string) => {
  const estadoMap: Record<string, string> = {
    'draft': 'Borrador',
    'issued': 'Emitida',
    'paid': 'Pagada',
    'partial': 'Pago Parcial',
    'void': 'Anulada'
  };
  return estadoMap[estado] || estado;
};

export function DetalleFactura({ factura }: { factura: any }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPaid, setIsPaid] = useState(factura.status === 'paid');
  const [dialogPagoOpen, setDialogPagoOpen] = useState(false);
  const [dialogNotaCreditoOpen, setDialogNotaCreditoOpen] = useState(false);
  const [facturaActual, setFacturaActual] = useState(factura);
  const [pagosActuales, setPagosActuales] = useState(factura.pagos);

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

  // Función para actualizar los pagos después de registrar uno nuevo
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
      
      // Obtener pagos actualizados
      const { data: pagosData, error: pagosError } = await supabase
        .from('payments')
        .select('*')
        .eq('source', 'invoice_sales')
        .eq('source_id', facturaActual.id)
        .order('created_at', { ascending: false });
      
      if (pagosError) throw pagosError;
      if (pagosData) setPagosActuales(pagosData);
      
      // Actualizar estado de pago
      setIsPaid(facturaData?.status === 'paid');
      
    } catch (error: any) {
      console.error('Error al actualizar datos:', error);
    }
  }, [facturaActual.id]);

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
  
  // Manejar la navegación de regreso
  const handleBack = () => {
    router.back();
  };

  return (
    <div className="space-y-6">
      {/* Cabecera con botón de regreso */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            onClick={handleBack}
            className="p-0 h-auto hover:bg-transparent"
          >
            <ArrowLeft className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" />
          </Button>
          <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Factura #{factura.number}
          </h1>
          <Badge variant={getBadgeVariant(facturaActual.status)} className="text-md py-1.5 px-3">
            {getStatusText(facturaActual.status)}
          </Badge>
        </div>
        
        <div className="flex gap-2 flex-wrap">
          <Button 
            variant="outline" 
            size="sm"
            onClick={generarPDF}
            className="flex items-center gap-1 py-0.5 h-7 px-2 text-xs"
            title="Descargar PDF"
          >
            <Download size={14} />
            <span className="hidden sm:inline">PDF</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={enviarPorEmail}
            className="flex items-center gap-1 py-0.5 h-7 px-2 text-xs"
            title="Enviar por Email"
          >
            <Mail size={14} />
            <span className="hidden sm:inline">Email</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={enviarPorWhatsApp}
            className="flex items-center gap-1 py-0.5 h-7 px-2 text-xs"
            title="Enviar por WhatsApp"
          >
            <Send size={14} />
            <span className="hidden sm:inline">WhatsApp</span>
          </Button>
          
          {facturaActual.status !== 'paid' && facturaActual.status !== 'void' && (
            <>
              <Button
                variant="outline"
                className="border-blue-500 text-blue-500 hover:text-blue-600 hover:border-blue-600"
                onClick={() => setDialogNotaCreditoOpen(true)}
              >
                Generar Nota de Crédito
              </Button>
              {/* Siempre mostrar el botón Registrar Abono si no está pagada o anulada */}
              <Button 
                onClick={() => {
                  console.log("Abriendo diálogo de pago", facturaActual);
                  setDialogPagoOpen(true);
                }}
                className="bg-green-600 hover:bg-green-700"
              >
                Registrar Abono
              </Button>
              {/* Mantener la opción de marcar como pagada directamente */}
              <Button 
                onClick={marcarComoPagada}
                variant="outline"
              >
                Marcar como Pagada
              </Button>
            </>
          )}
        </div>
      </div>
      
      {/* Información de la factura */}
      <Card className="col-span-2">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="h-5 w-5" />
            Información de la Factura
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-gray-500 dark:text-gray-400 font-medium w-32">Número:</span>
                <span className="text-gray-900 dark:text-gray-100">{factura.number}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-500 dark:text-gray-400 font-medium w-32">Cliente:</span>
                <span className="text-gray-900 dark:text-gray-100">{factura.customers?.full_name || 'N/A'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-500 dark:text-gray-400 font-medium w-32">Email:</span>
                <span className="text-gray-900 dark:text-gray-100">{factura.customers?.email || 'N/A'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-500 dark:text-gray-400 font-medium w-32">Teléfono:</span>
                <span className="text-gray-900 dark:text-gray-100">{factura.customers?.phone || 'N/A'}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-gray-500 dark:text-gray-400 font-medium w-32">Fecha de Emisión:</span>
                <span className="text-gray-900 dark:text-gray-100">
                  {factura.issue_date ? formatDate(factura.issue_date) : 'N/A'}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-500 dark:text-gray-400 font-medium w-32">Fecha de Vencimiento:</span>
                <span className="text-gray-900 dark:text-gray-100">
                  {factura.due_date ? formatDate(factura.due_date) : 'N/A'}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-500 dark:text-gray-400 font-medium w-32">Método de Pago:</span>
                <span className="text-gray-900 dark:text-gray-100">{factura.payment_method || 'N/A'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-500 dark:text-gray-400 font-medium w-32">Términos de Pago:</span>
                <span className="text-gray-900 dark:text-gray-100">
                  {factura.payment_terms ? `${factura.payment_terms} días` : 'N/A'}
                </span>
              </div>
            </div>
          </div>
          
          {factura.notes && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Notas:</h4>
              <p className="text-gray-900 dark:text-gray-100 text-sm p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
                {factura.notes}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Resumen financiero */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Resumen Financiero
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Subtotal:</span>
              <span className="font-medium">{formatCurrency(factura.subtotal || 0)}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Impuestos:</span>
              <span className="font-medium">{formatCurrency(factura.tax_total || 0)}</span>
            </div>
            
            <Separator />
            
            <div className="flex justify-between">
              <span className="font-medium">Total:</span>
              <span className="font-bold text-lg">{formatCurrency(factura.total || 0)}</span>
            </div>
            
            <Separator />
            
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Pagado:</span>
              <span className="font-medium text-green-600 dark:text-green-400">
                {formatCurrency((factura.total || 0) - (factura.balance || 0))}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Pendiente:</span>
              <span className={`font-medium ${saldoPendiente > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {formatCurrency(saldoPendiente)}
              </span>
            </div>
            
            {isPagada && (
              <div className="mt-4 bg-green-50 dark:bg-green-900/20 p-3 rounded-md flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="text-green-600 dark:text-green-400 text-sm font-medium">Factura completamente pagada</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Sección de items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Detalle de Items</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemsDetalle items={factura.items} />
        </CardContent>
      </Card>
      
      {/* Sección de pagos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pagos Aplicados</CardTitle>
        </CardHeader>
        <CardContent>
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
