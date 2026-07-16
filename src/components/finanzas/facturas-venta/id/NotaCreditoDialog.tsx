'use client';

import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { CreditNoteNumberService } from '@/lib/services/creditNoteNumberService';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';

interface NotaCreditoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factura: any;
  items: any[];
  onSuccess?: () => void;
}

export function NotaCreditoDialog({ open, onOpenChange, factura, items, onSuccess }: NotaCreditoDialogProps) {
  const { toast } = useToast();
  const organizationId = getOrganizationId();

  // Estados del formulario
  const [isLoading, setIsLoading] = useState(false);
  const [notaNumero, setNotaNumero] = useState<string>('');
  const [motivo, setMotivo] = useState<string>('');
  const [montoTotal, setMontoTotal] = useState<number>(0);
  const [itemsSeleccionados, setItemsSeleccionados] = useState<{ [key: string]: boolean }>({});
  const [cantidades, setCantidades] = useState<{ [key: string]: number }>({});
  const [ultimoNumero, setUltimoNumero] = useState<string>('');
  const [modo, setModo] = useState<'items' | 'valor'>('items');
  const [conceptoValor, setConceptoValor] = useState<string>('');
  const [montoValor, setMontoValor] = useState<number>(0);

  // Cargar siguiente número de nota de crédito usando servicio centralizado
  const cargarSiguienteNumero = async () => {
    if (!organizationId) return;
    
    try {
      const nextNumber = await CreditNoteNumberService.generateNextCreditNoteNumber(
        String(organizationId)
      );
      setNotaNumero(nextNumber);
      
      // Para mostrar información del último número (opcional)
      const { data } = await supabase
        .from('invoice_sales')
        .select('number')
        .eq('organization_id', String(organizationId))
        .eq('document_type', 'credit_note')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
      if (data?.number) {
        setUltimoNumero(data.number);
      }
      
    } catch (error: any) {
      console.error('Error al generar número de nota de crédito:', error);
      toast({
        title: 'Error',
        description: 'No se pudo generar el número de nota de crédito',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    if (open) {
      cargarSiguienteNumero();
      
      // Inicializar cantidades con los valores de la factura original
      const initialCantidades: { [key: string]: number } = {};
      items.forEach(item => {
        initialCantidades[item.id] = item.qty;
      });
      setCantidades(initialCantidades);
      
      // Resetear selección de items
      setItemsSeleccionados({});
      setMontoTotal(0);
      setModo('items');
      setConceptoValor('');
      setMontoValor(0);
    }
  }, [open, organizationId, items]);

  // Actualizar monto total cuando cambian las selecciones o cantidades
  useEffect(() => {
    if (modo === 'valor') {
      setMontoTotal(Number(montoValor) || 0);
      return;
    }
    const facturaSubtotal = Math.abs(Number(factura.subtotal) || 0);
    const facturaTaxTotal = Math.abs(Number(factura.tax_total) || 0);
    const tasaEfectiva = facturaSubtotal > 0 ? (facturaTaxTotal / facturaSubtotal) * 100 : 0;

    let total = 0;
    
    items.forEach(item => {
      if (itemsSeleccionados[item.id]) {
        const cantidad = Math.min(cantidades[item.id] || 0, item.qty);
        const precioUnitario = item.unit_price || 0;
        const lineaTotal = cantidad * precioUnitario;
        const impuestoTasa = item.tax_rate != null ? Number(item.tax_rate) : tasaEfectiva;
        const impuestoMonto = (lineaTotal * impuestoTasa) / 100;
        total += lineaTotal + impuestoMonto;
      }
    });
    
    setMontoTotal(total);
  }, [itemsSeleccionados, cantidades, items, factura, modo, montoValor]);

  // Manejar cambio en la selección de un item
  const handleItemToggle = (itemId: string, checked: boolean) => {
    setItemsSeleccionados(prev => ({
      ...prev,
      [itemId]: checked
    }));
  };

  // Manejar cambio en la cantidad de un item
  const handleCantidadChange = (itemId: string, value: string) => {
    const cantidad = parseInt(value, 10);
    const item = items.find(i => i.id === itemId);
    const maxCantidad = item ? item.qty : 0;
    
    if (!isNaN(cantidad) && cantidad >= 0 && cantidad <= maxCantidad) {
      setCantidades(prev => ({
        ...prev,
        [itemId]: cantidad
      }));
    }
  };

  // Función para generar la nota de crédito
  const handleSubmit = async () => {
    // Obtener el ID del usuario actual
    const { data: { session } } = await supabase.auth.getSession();
    const currentUserId = session?.user?.id;
    
    if (!currentUserId) {
      toast({
        title: "Error",
        description: "No se pudo obtener la información del usuario actual.",
        variant: "destructive"
      });
      return;
    }
    
    if (!organizationId) {
      toast({
        title: "Error",
        description: "No se pudo determinar la organización",
        variant: "destructive"
      });
      return;
    }
    
    // Validaciones
    if (!notaNumero.trim()) {
      toast({
        title: "Error",
        description: "Debe ingresar un número de nota de crédito",
        variant: "destructive"
      });
      return;
    }
    
    if (!motivo.trim()) {
      toast({
        title: "Error",
        description: "Debe ingresar un motivo para la nota de crédito",
        variant: "destructive"
      });
      return;
    }

    if (modo === 'valor' && !conceptoValor.trim()) {
      toast({
        title: "Error",
        description: "Debe ingresar un concepto para la nota de crédito por valor",
        variant: "destructive"
      });
      return;
    }
    
    if (montoTotal <= 0) {
      toast({
        title: "Error",
        description: "Debe seleccionar al menos un ítem y especificar cantidades válidas",
        variant: "destructive"
      });
      return;
    }
    
    // Comprobar que la factura existe
    if (!factura || !factura.id) {
      toast({
        title: "Error",
        description: "No se encontró la factura original",
        variant: "destructive"
      });
      return;
    }

    // Verificar si hay ítems seleccionados con cantidad > 0
    const itemsValidos = modo === 'valor' ? true : Object.keys(itemsSeleccionados).some(
      id => itemsSeleccionados[id] && cantidades[id] > 0
    );
    
    if (!itemsValidos) {
      toast({
        title: "Error",
        description: "Debes tener al menos un ítem con cantidad mayor que cero",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // 1. Obtener el método de pago de la factura original
      console.log('🔍 Obteniendo método de pago de la factura original:', factura.id);
      
      const { data: originalInvoice, error: invoiceError } = await supabase
        .from('invoice_sales')
        .select('payment_method')
        .eq('id', factura.id)
        .single();

      if (invoiceError) {
        console.error('❌ Error obteniendo factura original:', invoiceError);
        throw new Error('No se pudo obtener la información de la factura original');
      }

      const paymentMethod = originalInvoice?.payment_method || factura.payment_method || 'credit';
      console.log('✅ Método de pago a usar en nota de crédito:', paymentMethod);

      // Obtener usuario actual
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id;

      // 2. Crear la nota de crédito (es una factura con tipo credit_note)
      const taxIncluded = factura.tax_included || false;
      const { data: creditNoteData, error: creditNoteError } = await supabase
        .from('invoice_sales')
        .insert({
          organization_id: organizationId,
          branch_id: factura.branch_id,
          customer_id: factura.customer_id,
          number: notaNumero,
          issue_date: new Date().toISOString(),
          due_date: new Date().toISOString(),
          currency: factura.currency || 'COP',
          subtotal: -montoTotal,  // Se actualizará después con el desglose correcto
          tax_total: 0,  // Se calculará después
          total: -montoTotal,  // Negativo para nota de crédito
          balance: 0,  // Notas de crédito comienzan en 0 porque se aplican directamente
          status: 'issued',
          tax_included: taxIncluded, // Heredar de factura original
          description: `Nota de crédito para factura ${factura.number}. Motivo: ${motivo}`,
          related_invoice_id: factura.id,
          document_type: 'credit_note',
          payment_method: paymentMethod, // Heredar método de pago de factura original
          created_by: currentUserId  // Añadimos el ID del usuario que crea la nota
          // No incluimos sale_id porque tiene una restricción a la tabla sales
        })
        .select();

      if (creditNoteError) throw creditNoteError;
      
      if (!creditNoteData || creditNoteData.length === 0) {
        throw new Error('No se pudo crear la nota de crédito');
      }
      
      const notaCreditoId = creditNoteData[0].id;

      // MODO POR VALOR: una sola línea de concepto libre (sin mover inventario)
      if (modo === 'valor') {
        const monto = Number(montoValor) || 0;

        const { error: itemValorError } = await supabase
          .from('invoice_items')
          .insert({
            invoice_id: notaCreditoId,
            invoice_sales_id: notaCreditoId,
            invoice_type: 'sale',
            product_id: null,
            description: conceptoValor,
            qty: 1,
            unit_price: monto,
            tax_code: null,
            tax_rate: 0,
            tax_included: false,
            total_line: -monto,
            discount_amount: 0
          });

        if (itemValorError) throw itemValorError;

        // Confirmar totales de la nota de crédito (sin impuesto)
        await supabase
          .from('invoice_sales')
          .update({ subtotal: -monto, tax_total: 0, total: -monto })
          .eq('id', notaCreditoId);

        // Actualizar saldo de la factura original
        const nuevoSaldoV = Math.max(0, factura.balance - monto);
        const nuevoEstadoV = nuevoSaldoV <= 0 ? 'void' : nuevoSaldoV < factura.total ? 'partial' : factura.status;
        const { error: facturaVError } = await supabase
          .from('invoice_sales')
          .update({ balance: nuevoSaldoV, status: nuevoEstadoV })
          .eq('id', factura.id);
        if (facturaVError) throw facturaVError;

        // Actualizar accounts_receivable si existe
        const { data: arV } = await supabase
          .from('accounts_receivable')
          .select('id, balance')
          .eq('invoice_id', factura.id)
          .maybeSingle();
        if (arV) {
          const nuevoSaldoARV = Math.max(0, Number(arV.balance) - monto);
          await supabase
            .from('accounts_receivable')
            .update({ balance: nuevoSaldoARV, status: nuevoSaldoARV <= 0 ? 'current' : 'overdue' })
            .eq('id', arV.id);
        }

        toast({
          title: 'Nota de crédito generada',
          description: `Se ha generado la nota de crédito ${notaNumero} por ${formatCurrency(monto)} exitosamente`,
        });

        onOpenChange(false);
        if (onSuccess) onSuccess();
        return;
      }

      // 2. Crear los ítems de la nota de crédito
      const itemsNotaCredito = [];
      let subtotal = 0;
      let taxTotal = 0;

      // Calcular tasa efectiva de impuesto de la factura original
      const facturaSubtotal = Math.abs(Number(factura.subtotal) || 0);
      const facturaTaxTotal = Math.abs(Number(factura.tax_total) || 0);
      const tasaEfectiva = facturaSubtotal > 0 ? (facturaTaxTotal / facturaSubtotal) * 100 : 0;

      for (const itemId of Object.keys(itemsSeleccionados)) {
        if (itemsSeleccionados[itemId] && cantidades[itemId] > 0) {
          const item = items.find(i => i.id === itemId);
          if (item) {
            const cantidad = cantidades[itemId];
            const precioUnitario = item.unit_price || 0;
            // Usar tax_rate del item si existe, si no, usar tasa efectiva de la factura
            const impuestoTasa = item.tax_rate != null ? Number(item.tax_rate) : tasaEfectiva;
            const lineaTotal = cantidad * precioUnitario;

            let baseImponible = lineaTotal;
            let impuestoMonto = 0;

            if (taxIncluded && impuestoTasa > 0) {
              // Precios con impuesto incluido: extraer la base del precio total
              baseImponible = lineaTotal / (1 + impuestoTasa / 100);
              baseImponible = Math.round(baseImponible * 100) / 100;
              impuestoMonto = lineaTotal - baseImponible;
            } else if (!taxIncluded && impuestoTasa > 0) {
              // Precios sin impuesto: calcular impuesto sobre la base
              impuestoMonto = (lineaTotal * impuestoTasa) / 100;
              impuestoMonto = Math.round(impuestoMonto * 100) / 100;
            }

            const totalLinea = taxIncluded ? lineaTotal : (lineaTotal + impuestoMonto);

            itemsNotaCredito.push({
              invoice_id: notaCreditoId,
              invoice_sales_id: notaCreditoId,
              invoice_type: 'sale',
              product_id: item.product_id,
              description: item.description,
              qty: cantidad,
              unit_price: precioUnitario,
              tax_code: item.tax_code,
              tax_rate: impuestoTasa,
              tax_included: taxIncluded,
              total_line: -totalLinea, // Negativo
              discount_amount: item.discount_amount || 0
            });

            subtotal += baseImponible;
            taxTotal += impuestoMonto;
          }
        }
      }
      
      if (itemsNotaCredito.length > 0) {
        const { error: itemsError } = await supabase
          .from('invoice_items')
          .insert(itemsNotaCredito);
          
        if (itemsError) throw itemsError;
      }
      
      // 3. Actualizar totales de la nota de crédito
      const { error: updateError } = await supabase
        .from('invoice_sales')
        .update({
          subtotal: -subtotal,
          tax_total: -taxTotal,
          total: -(subtotal + taxTotal)
        })
        .eq('id', notaCreditoId);
        
      if (updateError) throw updateError;
      
      // 3.5 Copiar impuestos aplicados de la factura original a la nota crédito
      const { data: originalAppliedTaxes } = await supabase
        .from('invoice_applied_taxes')
        .select('tax_code, is_applied')
        .eq('invoice_id', factura.id);

      if (originalAppliedTaxes && originalAppliedTaxes.length > 0) {
        const appliedTaxesNota = originalAppliedTaxes.map(t => ({
          invoice_id: notaCreditoId,
          tax_code: t.tax_code,
          is_applied: t.is_applied,
        }));
        const { error: taxError } = await supabase
          .from('invoice_applied_taxes')
          .insert(appliedTaxesNota);
        if (taxError) console.error('Error al copiar impuestos aplicados:', taxError);
      }
      
      // 4. Actualizar saldo de la factura original
      const nuevoSaldo = Math.max(0, factura.balance - (subtotal + taxTotal));
      const nuevoEstado = nuevoSaldo <= 0 ? 'void' : nuevoSaldo < factura.total ? 'partial' : factura.status;
      
      const { error: facturaUpdateError } = await supabase
        .from('invoice_sales')
        .update({
          balance: nuevoSaldo,
          status: nuevoEstado
        })
        .eq('id', factura.id);
        
      if (facturaUpdateError) throw facturaUpdateError;
      
      // 5. Actualizar accounts_receivable si existe
      const { data: arData, error: arFindError } = await supabase
        .from('accounts_receivable')
        .select('id, balance')
        .eq('invoice_id', factura.id)
        .maybeSingle();

      if (!arFindError && arData) {
        const nuevoSaldoAR = Math.max(0, arData.balance - (subtotal + taxTotal));
        const { error: arUpdateError } = await supabase
          .from('accounts_receivable')
          .update({
            balance: nuevoSaldoAR,
            status: nuevoSaldoAR <= 0 ? 'current' : 'overdue'
          })
          .eq('id', arData.id);

        if (arUpdateError) console.error('Error al actualizar cuentas por cobrar:', arUpdateError);
      }

      toast({
        title: "Nota de crédito generada",
        description: `Se ha generado la nota de crédito ${notaNumero} por ${formatCurrency(subtotal + taxTotal)} exitosamente`,
      });

      // Cerrar el diálogo y llamar a onSuccess si está definido
      onOpenChange(false);
      if (onSuccess) onSuccess();

    } catch (error: any) {
      console.error('Error al generar nota de crédito:', error);
      
      // Manejo de errores específicos
      let mensajeError = 'Error al generar nota de crédito';
      
      if (error?.code === '23503' && error?.message?.includes('fk_invoice_sales_sale')) {
        mensajeError = 'Error de referencia: La factura original no puede ser referenciada como venta.';
      } else if (error?.code === 'PGRST204') {
        mensajeError = 'Error en la estructura de la base de datos. Por favor contacte al administrador.';
      } else if (error?.message) {
        mensajeError = `${mensajeError}: ${error.message}`;
      }
      
      toast({
        title: 'Error',
        description: mensajeError,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Generar Nota de Crédito</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid items-center gap-1.5">
              <Label htmlFor="facturaOriginal">Factura Original</Label>
              <Input
                id="facturaOriginal"
                value={factura.number || ''}
                disabled
              />
            </div>
            <div className="grid items-center gap-1.5">
              <Label htmlFor="notaNumero">Número de Nota de Crédito</Label>
              <Input
                id="notaNumero"
                value={notaNumero}
                onChange={(e) => setNotaNumero(e.target.value)}
                placeholder="NC00000001"
              />
              {ultimoNumero && (
                <p className="text-xs text-muted-foreground">
                  Último número: {ultimoNumero}
                </p>
              )}
            </div>
          </div>
          
          <div className="grid items-center gap-1.5">
            <Label htmlFor="motivo">Motivo de la Nota de Crédito</Label>
            <Textarea
              id="motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Explica el motivo de la nota de crédito..."
              rows={2}
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant={modo === 'items' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setModo('items')}
            >
              Por devolución de ítems
            </Button>
            <Button
              type="button"
              variant={modo === 'valor' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setModo('valor')}
            >
              Por valor / concepto
            </Button>
          </div>

          {modo === 'valor' && (
            <div className="grid gap-3">
              <div className="grid items-center gap-1.5">
                <Label htmlFor="conceptoValor">Concepto</Label>
                <Input
                  id="conceptoValor"
                  value={conceptoValor}
                  onChange={(e) => setConceptoValor(e.target.value)}
                  placeholder="Ej: Descuento comercial acordado"
                />
              </div>
              <div className="grid items-center gap-1.5">
                <Label htmlFor="montoValor">Monto</Label>
                <Input
                  id="montoValor"
                  type="number"
                  min="0"
                  value={montoValor || 0}
                  onChange={(e) => setMontoValor(parseFloat(e.target.value) || 0)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                La nota de crédito por valor reduce el saldo de la factura sin mover inventario.
              </p>
            </div>
          )}

          {modo === 'items' && (
          <div>
            <Label>Selecciona los Ítems para la Nota de Crédito</Label>
            <div className="border rounded-md mt-1.5 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Sel.</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="w-24 text-right">Cant. Original</TableHead>
                    <TableHead className="w-28">Cant. a Devolver</TableHead>
                    <TableHead className="w-24 text-right">Precio Unit.</TableHead>
                    <TableHead className="w-24 text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length > 0 ? (
                    items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Checkbox
                            checked={!!itemsSeleccionados[item.id]}
                            onCheckedChange={(checked) => 
                              handleItemToggle(item.id, checked === true)
                            }
                          />
                        </TableCell>
                        <TableCell className="font-medium">{item.description}</TableCell>
                        <TableCell className="text-right">{item.qty}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            max={item.qty}
                            value={cantidades[item.id] || 0}
                            onChange={(e) => handleCantidadChange(item.id, e.target.value)}
                            disabled={!itemsSeleccionados[item.id]}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.unit_price || 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          {itemsSeleccionados[item.id] 
                            ? formatCurrency((cantidades[item.id] || 0) * (item.unit_price || 0)) 
                            : formatCurrency(0)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-4">
                        No hay ítems disponibles
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
          )}
          
          <div className="flex justify-end items-center gap-2 mt-2">
            <span className="text-sm font-medium">Total de Nota de Crédito:</span>
            <span className="text-lg font-bold">{formatCurrency(montoTotal)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || montoTotal <= 0}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Generar Nota de Crédito
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
