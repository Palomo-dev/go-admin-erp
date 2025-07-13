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

  // Cargar último número de nota de crédito
  useEffect(() => {
    const cargarUltimoNumero = async () => {
      if (!organizationId) return;
      
      try {
        const { data, error } = await supabase
          .from('invoice_sales')
          .select('number')
          .eq('organization_id', organizationId)
          .ilike('number', 'NC%')
          .order('number', { ascending: false })
          .limit(1);

        if (error) throw error;
        
        if (data && data.length > 0) {
          // Extraer el número y aumentarlo en 1
          const lastNum = data[0].number;
          const numericPart = parseInt(lastNum.replace(/\D/g, ''), 10);
          const newNumber = `NC${String(numericPart + 1).padStart(8, '0')}`;
          setNotaNumero(newNumber);
          setUltimoNumero(lastNum);
        } else {
          // Si no hay notas de crédito previas
          setNotaNumero(`NC00000001`);
        }
      } catch (error: any) {
        console.error('Error al cargar último número de nota de crédito:', error);
      }
    };

    if (open) {
      cargarUltimoNumero();
      
      // Inicializar cantidades con los valores de la factura original
      const initialCantidades: { [key: string]: number } = {};
      items.forEach(item => {
        initialCantidades[item.id] = item.qty;
      });
      setCantidades(initialCantidades);
      
      // Resetear selección de items
      setItemsSeleccionados({});
      setMontoTotal(0);
    }
  }, [open, organizationId, items]);

  // Actualizar monto total cuando cambian las selecciones o cantidades
  useEffect(() => {
    let total = 0;
    
    items.forEach(item => {
      if (itemsSeleccionados[item.id]) {
        const cantidad = Math.min(cantidades[item.id] || 0, item.qty);
        const precioUnitario = item.unit_price || 0;
        total += cantidad * precioUnitario;
      }
    });
    
    setMontoTotal(total);
  }, [itemsSeleccionados, cantidades, items]);

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
    if (!organizationId || !notaNumero || !motivo) {
      toast({
        title: "Error",
        description: "Por favor completa todos los campos requeridos",
        variant: "destructive",
      });
      return;
    }

    if (montoTotal <= 0) {
      toast({
        title: "Error",
        description: "Debes seleccionar al menos un ítem para generar la nota de crédito",
        variant: "destructive",
      });
      return;
    }

    // Verificar si hay ítems seleccionados con cantidad > 0
    const itemsValidos = Object.keys(itemsSeleccionados).some(
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
      // 1. Crear la nota de crédito (es una factura con tipo credit_note)
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
          subtotal: -montoTotal,  // Negativo para nota de crédito
          tax_total: 0,  // Se calculará después
          total: -montoTotal,  // Negativo para nota de crédito
          balance: 0,  // Notas de crédito comienzan en 0 porque se aplican directamente
          status: 'issued',
          description: `Nota de crédito para factura ${factura.number}. Motivo: ${motivo}`,
          related_invoice_id: factura.id,
          document_type: 'credit_note'
        })
        .select();

      if (creditNoteError) throw creditNoteError;
      
      if (!creditNoteData || creditNoteData.length === 0) {
        throw new Error('No se pudo crear la nota de crédito');
      }
      
      const notaCreditoId = creditNoteData[0].id;
      
      // 2. Crear los ítems de la nota de crédito
      const itemsNotaCredito = [];
      let subtotal = 0;
      let taxTotal = 0;
      
      for (const itemId of Object.keys(itemsSeleccionados)) {
        if (itemsSeleccionados[itemId] && cantidades[itemId] > 0) {
          const item = items.find(i => i.id === itemId);
          if (item) {
            const cantidad = cantidades[itemId];
            const precioUnitario = item.unit_price || 0;
            const impuestoTasa = item.tax_rate || 0;
            const lineaTotal = cantidad * precioUnitario;
            
            const impuestoMonto = (lineaTotal * impuestoTasa) / 100;
            
            itemsNotaCredito.push({
              invoice_id: notaCreditoId,
              invoice_type: 'sale',
              product_id: item.product_id,
              description: item.description,
              qty: cantidad,
              unit_price: precioUnitario,
              tax_code: item.tax_code,
              tax_rate: impuestoTasa,
              tax_included: item.tax_included || false,
              total_line: -lineaTotal, // Negativo para nota de crédito
              discount_amount: item.discount_amount || 0
            });
            
            subtotal += lineaTotal;
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
      
      // 4. Actualizar saldo de la factura original
      const nuevoSaldo = Math.max(0, factura.balance - (subtotal + taxTotal));
      const nuevoEstado = nuevoSaldo <= 0 ? 'paid' : nuevoSaldo < factura.total ? 'partial' : factura.status;
      
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
      toast({
        title: "Error al generar nota de crédito",
        description: error.message || "Ocurrió un error inesperado",
        variant: "destructive",
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
