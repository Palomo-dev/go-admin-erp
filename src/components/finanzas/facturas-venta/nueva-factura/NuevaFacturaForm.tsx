'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/config';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchSelect } from '@/components/ui/search-select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toastSuccess, toastError } from '@/components/ui/use-toast';
import { getOrganizationId, getCurrentBranchIdWithFallback, getCurrentUserId } from '@/lib/hooks/useOrganization';
import { generateInvoiceNumber as generateInvoiceNumberUtil } from '@/lib/utils/invoiceUtils';
import { ClienteSelector } from './ClienteSelector';
import { ItemsFactura } from './ItemsFactura';
import { ImpuestosFactura } from './ImpuestosFactura';
import { FormaPagoSelector } from './FormaPagoSelector';
import { format } from 'date-fns';
import { Save, FileCheck, ArrowLeft, RefreshCw, Coins, User, Percent, DollarSign, AlertCircle } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import { ElectronicInvoiceToggle } from '@/components/finanzas/facturacion-electronica';
import { electronicInvoicingService } from '@/lib/services/electronicInvoicingService';
import { useElectronicInvoicePreference } from '@/lib/hooks/useElectronicInvoicePreference';
import { toLocalDateString, parseLocalDate, formatCurrency } from '@/utils/Utils';
import { serialTrackingService } from '@/lib/services/serialTrackingService';

// Tipo para un ítem de factura
export type InvoiceItem = {
  id?: string; // Cambiado a UUID (string en TypeScript)
  invoice_id?: string | null; // Campo mantenido por compatibilidad
  invoice_sales_id?: string | null; // Nuevo campo para relación con facturas de venta
  invoice_purchase_id?: string | null; // Nuevo campo para relación con facturas de compra
  invoice_type?: 'sale' | 'purchase'; // Tipo explícito para mayor seguridad
  product_id?: number | null; // Mantenemos product_id como número
  description: string;
  qty: number;
  unit_price: number;
  tax_code?: string | null;
  tax_rate?: number | null;
  tax_included: boolean; // Indica si el impuesto está incluido en el precio
  total_line: number;
  discount_amount?: number | null;
  product_name?: string; // Campo adicional para UI
  stock_qty?: number | null; // Stock disponible (para validación en UI)
  track_stock?: boolean | null; // Si el producto controla stock
  track_serial?: boolean | null; // Si el producto requiere captura de seriales
  product_sku?: string | null; // SKU del producto (para SerialSelectorDialog)
};

// Tipo para una factura
interface Invoice {
  id?: string;
  organization_id: number;
  branch_id: number; // Campo obligatorio según el esquema de la DB
  customer_id: string | null; // Cambiado a string para UUID
  sale_id?: string; // Relación con la tabla sales
  number: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string | null;
  subtotal: number | null;
  tax_total: number | null;
  total: number | null;
  balance: number | null;
  status: string;
  payment_terms: number | null;
  payment_method: string | null;
  notes: string | null;
  tax_included?: boolean; // Indicador si los impuestos están incluidos en los precios
  opportunity_id?: string | null; // Relación con oportunidad (opcional)
  created_by?: string; // ID del usuario que crea la factura
};

interface NuevaFacturaFormProps {
  facturaInicial?: any;
  onSubmit?: (datosFactura: any) => Promise<void>;
  saving?: boolean;
  esEdicion?: boolean;
}

export function NuevaFacturaForm({ facturaInicial, onSubmit, saving, esEdicion }: NuevaFacturaFormProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const organizationId = getOrganizationId();
  
  // Parámetros de duplicación
  const duplicarId = searchParams.get('duplicar');
  const clienteParam = searchParams.get('cliente');
  const monedaParam = searchParams.get('moneda');
  const terminosParam = searchParams.get('terminos');
  const metodoPagoParam = searchParams.get('metodo_pago');
  const notasParam = searchParams.get('notas');

  // Estados para el formulario
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<number>(getCurrentBranchIdWithFallback()); // Usar branch_id actual del selector
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [isDuplicateNumber, setIsDuplicateNumber] = useState<boolean>(false);
  const [isValidatingNumber, setIsValidatingNumber] = useState<boolean>(false);
  const [issueDate, setIssueDate] = useState<Date | undefined>(new Date());
  const [dueDate, setDueDate] = useState<Date | undefined>(() => {
    // Inicializar fecha de vencimiento basada en fecha actual + 30 días
    const date = new Date();
    date.setDate(date.getDate() + 30); // Valor predeterminado
    return date;
  });
  const [items, setItems] = useState<InvoiceItem[]>([]);
  // Selecciones de seriales por product_id (mismo formato que el POS)
  const [serialSelections, setSerialSelections] = useState<Record<number, number[]>>({});
  const [paymentTerms, setPaymentTerms] = useState<number>(30); // Ahora usamos número de días
  const [isCustomPaymentTerm, setIsCustomPaymentTerm] = useState<boolean>(false);
  const [paymentMethodCode, setPaymentMethodCode] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [sendToFactus, setSendToFactus] = useState<boolean>(false);
  const { alwaysEnabled: eInvoiceAlwaysEnabled } = useElectronicInvoicePreference();

  // Si la preferencia global está activa, forzar sendToFactus = true
  useEffect(() => {
    if (eInvoiceAlwaysEnabled) {
      setSendToFactus(true);
    }
  }, [eInvoiceAlwaysEnabled]);

  // Estados para moneda
  const [currency, setCurrency] = useState<string>('COP');
  const [currencies, setCurrencies] = useState<{code: string; name: string; symbol: string}[]>([]);
  const [loadingCurrencies, setLoadingCurrencies] = useState<boolean>(false);

  // Estados para impuestos
  const [taxIncluded, setTaxIncluded] = useState<boolean>(false);

  // Estados para comisión
  const [salespersonId, setSalespersonId] = useState<string>('');
  const [commissionRate, setCommissionRate] = useState<number>(0);
  const [commissionType, setCommissionType] = useState<'salesperson' | 'intermediation_sale' | 'none'>('salesperson');
  const [commissionMethod, setCommissionMethod] = useState<'percentage' | 'fixed_amount'>('percentage');
  const [organizationMembers, setOrganizationMembers] = useState<{ id: string; name: string }[]>([]);
  const [appliedTaxes, setAppliedTaxes] = useState<{[key: string]: boolean}>({}); // Indicador de impuestos aplicados
  const [appliedTaxTotals, setAppliedTaxTotals] = useState<{[key: string]: any}>({}); // Totales de impuestos aplicados
  const [subtotal, setSubtotal] = useState<number>(0);
  const [taxTotal, setTaxTotal] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);

  // Estado para selector de oportunidad (opcional)
  const [opportunities, setOpportunities] = useState<{ id: string; name: string; customer_id?: string | null }[]>([]);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string>('none');

  // Totales calculados desde los items (fuente de verdad para comisiones)
  // Los estados subtotal/total pueden estar en 0 si la sincronización
  // con ImpuestosFactura no ocurrió, pero los items siempre tienen el valor correcto.
  const itemsTotalForCommission = useMemo(() =>
    items.reduce((sum, it) => sum + (Number(it.total_line) || 0), 0),
    [items]
  );
  const itemsSubtotalForCommission = useMemo(() => {
    const taxFromItems = items.reduce((sum, it) => {
      const qty = Number(it.qty) || 0;
      const unitPrice = Number(it.unit_price) || 0;
      const rate = Number(it.tax_rate) || 0;
      const totalLine = Number(it.total_line) || 0;
      const discount = Number(it.discount_amount) || 0;
      if (rate <= 0) return sum;
      const lineBase = qty * unitPrice - discount;
      if (it.tax_included) {
        const base = totalLine / (1 + rate / 100);
        return sum + (totalLine - base);
      }
      return sum + (totalLine - lineBase);
    }, 0);
    return itemsTotalForCommission - taxFromItems;
  }, [items, itemsTotalForCommission]);

  // Función para cargar monedas de la organización
  const loadCurrencies = useCallback(async () => {
    if (!organizationId) return;
    
    setLoadingCurrencies(true);
    try {
      // Primero obtener las monedas de la organización
      const { data: orgCurrencies, error: orgError } = await supabase
        .from('organization_currencies')
        .select('currency_code, is_base')
        .eq('organization_id', organizationId);
        
      if (orgError) throw orgError;
      
      if (orgCurrencies && orgCurrencies.length > 0) {
        // Obtener los detalles de las monedas
        const currencyCodes = orgCurrencies.map(oc => oc.currency_code);
        const { data: currencyDetails, error: currError } = await supabase
          .from('currencies')
          .select('code, name, symbol')
          .in('code', currencyCodes);
          
        if (currError) throw currError;
        
        const currencyList = orgCurrencies.map((item: any) => {
          const details = currencyDetails?.find(c => c.code === item.currency_code);
          return {
            code: item.currency_code,
            name: details?.name || item.currency_code,
            symbol: details?.symbol || '$'
          };
        });
        setCurrencies(currencyList);
        
        // Establecer la moneda base como predeterminada
        const baseCurrency = orgCurrencies.find((item: any) => item.is_base);
        if (baseCurrency) {
          setCurrency(baseCurrency.currency_code);
        } else if (currencyList.length > 0) {
          setCurrency(currencyList[0].code);
        }
      } else {
        // Si no hay monedas configuradas, usar COP por defecto
        setCurrencies([{ code: 'COP', name: 'Peso Colombiano', symbol: '$' }]);
        setCurrency('COP');
      }
    } catch (error) {
      console.error('Error al cargar monedas:', error);
      // Si falla, usar COP por defecto
      setCurrencies([{ code: 'COP', name: 'Peso Colombiano', symbol: '$' }]);
      setCurrency('COP');
    } finally {
      setLoadingCurrencies(false);
    }
  }, [organizationId]);

  // Cargar monedas al iniciar
  useEffect(() => {
    loadCurrencies();
  }, [loadCurrencies]);

  // Cargar miembros de la organización para selector de vendedor
  useEffect(() => {
    const loadMembers = async () => {
      if (!organizationId) return;
      try {
        const { data: members } = await supabase
          .from('organization_members')
          .select('user_id')
          .eq('organization_id', organizationId);

        if (members && members.length > 0) {
          const userIds = members.map(m => m.user_id);
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .in('id', userIds);

          const profileMap = new Map((profiles || []).map(p => [p.id, p]));
          const formatted = members.map((m: any) => {
            const p = profileMap.get(m.user_id);
            return {
              id: m.user_id,
              name: `${p?.first_name || ''} ${p?.last_name || ''}`.trim() || 'Usuario'
            };
          });
          setOrganizationMembers(formatted);
        }
      } catch (e) {
        console.warn('Error cargando miembros:', e);
      }
    };
    loadMembers();
  }, [organizationId]);

  // Cargar oportunidades abiertas de la organización
  useEffect(() => {
    const loadOpportunities = async () => {
      if (!organizationId) return;
      try {
        const { data, error } = await supabase
          .from('opportunities')
          .select('id, name, customer_id')
          .eq('organization_id', organizationId)
          .eq('status', 'open')
          .order('name');
        if (error) return;
        if (data) setOpportunities(data);
      } catch (e) {
        console.error('Error loading opportunities:', e);
      }
    };
    loadOpportunities();
  }, [organizationId]);

  // Manejar selección de oportunidad: prefill de productos y cliente
  const handleOpportunityChange = async (opportunityId: string) => {
    setSelectedOpportunityId(opportunityId);
    if (opportunityId === 'none') return;

    try {
      // Cargar productos de la oportunidad
      const { data: oppProducts, error: oppError } = await supabase
        .from('opportunity_products')
        .select('product_id, quantity, unit_price, total_price')
        .eq('opportunity_id', opportunityId);

      if (oppError || !oppProducts || oppProducts.length === 0) return;

      // Obtener nombres de productos
      const productIds = oppProducts.map((op: any) => op.product_id);
      const { data: products } = await supabase
        .from('products')
        .select('id, name')
        .in('id', productIds);

      const productMap = new Map((products || []).map((p: any) => [p.id, p.name] as [number, string]));

      const newItems: InvoiceItem[] = oppProducts.map((op: any) => ({
        invoice_type: 'sale' as const,
        product_id: op.product_id,
        description: productMap.get(op.product_id) || '',
        qty: Number(op.quantity) || 0,
        unit_price: Number(op.unit_price) || 0,
        tax_code: null,
        tax_rate: 0,
        tax_included: taxIncluded,
        total_line: Number(op.total_price) || (Number(op.quantity) || 0) * (Number(op.unit_price) || 0),
        discount_amount: 0,
      }));
      setItems(newItems);

      // Prefill del cliente si la oportunidad tiene customer_id
      const opp = opportunities.find((o) => o.id === opportunityId);
      if (opp?.customer_id) {
        setSelectedCustomerId(opp.customer_id);
      }
    } catch (e) {
      console.error('Error loading opportunity products:', e);
    }
  };

  // Cargar datos de factura para edición
  useEffect(() => {
    if (esEdicion && facturaInicial) {
      setInvoiceNumber(facturaInicial.number || '');
      setSelectedCustomerId(facturaInicial.customer_id || null);
      setCurrency(facturaInicial.currency || 'COP');
      setPaymentTerms(facturaInicial.payment_terms || 30);
      setPaymentMethodCode(facturaInicial.payment_method || '');
      setNotes(facturaInicial.notes || '');
      setTaxIncluded(facturaInicial.tax_included || false);
      setBranchId(facturaInicial.branch_id || getCurrentBranchIdWithFallback());
      setSalespersonId(facturaInicial.salesperson_id || '');
      setCommissionRate(Number(facturaInicial.commission_rate) || 0);
      setCommissionType(facturaInicial.commission_type || 'salesperson');
      setCommissionMethod((facturaInicial as any).commission_method || 'percentage');

      if (facturaInicial.issue_date) {
        setIssueDate(parseLocalDate(facturaInicial.issue_date));
      }
      if (facturaInicial.due_date) {
        setDueDate(parseLocalDate(facturaInicial.due_date));
      }

      // Cargar items de la factura
      if (facturaInicial.items && facturaInicial.items.length > 0) {
        const itemsFormateados = facturaInicial.items.map((item: any) => ({
          id: item.id,
          product_id: item.product_id,
          description: item.description || '',
          qty: Number(item.qty) || 0,
          unit_price: Number(item.unit_price) || 0,
          tax_code: item.tax_code,
          tax_rate: Number(item.tax_rate) || 0,
          tax_included: item.tax_included || false,
          total_line: Number(item.total_line) || 0,
          discount_amount: Number(item.discount_amount) || 0
        }));
        setItems(itemsFormateados);
      }
      return;
    }

    // Cargar datos de factura a duplicar
    const cargarDatosDuplicacion = async () => {
      if (!duplicarId || !organizationId) return;
      
      try {
        // Cargar items de la factura original
        const { data: itemsData, error: itemsError } = await supabase
          .from('invoice_items')
          .select('*')
          .eq('invoice_sales_id', duplicarId);
          
        if (itemsError) throw itemsError;
        
        if (itemsData && itemsData.length > 0) {
          const itemsFormateados = itemsData.map((item: any) => ({
            id: undefined, // Nuevo ID al guardar
            product_id: item.product_id,
            description: item.description,
            qty: item.qty,
            unit_price: item.unit_price,
            tax_code: item.tax_code,
            tax_rate: item.tax_rate,
            tax_included: item.tax_included || false,
            total_line: item.total_line,
            discount_amount: item.discount_amount || 0
          }));
          setItems(itemsFormateados);
        }
        
        // Aplicar parámetros de duplicación
        if (clienteParam) setSelectedCustomerId(clienteParam);
        if (monedaParam) setCurrency(monedaParam);
        if (terminosParam) setPaymentTerms(parseInt(terminosParam) || 30);
        if (metodoPagoParam) setPaymentMethodCode(metodoPagoParam);
        if (notasParam) setNotes(notasParam);
        
        toastSuccess("Factura duplicada", "Se han cargado los datos de la factura original. Modifique según necesite.");
        
      } catch (error) {
        console.error('Error al cargar datos de duplicación:', error);
        toastError("Error", "No se pudieron cargar los datos de la factura a duplicar.");
      }
    };
    
    cargarDatosDuplicacion();
  }, [duplicarId, organizationId, clienteParam, monedaParam, terminosParam, metodoPagoParam, notasParam]);

  // Función para verificar si el número de factura ya existe
  const checkDuplicateInvoiceNumber = useCallback(async (number: string) => {
    if (!number || !organizationId) return false;
    
    setIsValidatingNumber(true);
    try {
      let query = supabase
        .from('invoice_sales')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('number', number);
      
      // En modo edición, excluir la factura actual de la validación
      if (esEdicion && facturaInicial?.id) {
        query = query.neq('id', facturaInicial.id);
      }
      
      const { data, error } = await query.limit(1);
        
      if (error) throw error;
      
      // Si hay resultados, significa que el número ya existe
      const isDuplicate = data && data.length > 0;
      setIsDuplicateNumber(isDuplicate);
      
      if (isDuplicate) {
        toastError("Número duplicado", "Este número de factura ya existe. Por favor, utilice otro número.");
      }
      
      return isDuplicate;
    } catch (error) {
      console.error('Error al verificar duplicados:', error);
      return false;
    } finally {
      setIsValidatingNumber(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationId && !esEdicion) {
      generateInvoiceNumber();
    }
  }, [organizationId, esEdicion]);

  // Efecto para validar el número de factura cuando cambia
  useEffect(() => {
    // En modo edición, no validar automáticamente al cargar
    if (esEdicion) return;
    // Usar un timer para no validar con cada pulsación
    const timer = setTimeout(() => {
      if (invoiceNumber && invoiceNumber.trim() !== '') {
        checkDuplicateInvoiceNumber(invoiceNumber);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [invoiceNumber, checkDuplicateInvoiceNumber, esEdicion]);

  // Función para generar número de factura
  const generateInvoiceNumber = async () => {
    try {
      // Pasar el número actual para que siempre genere uno diferente
      const formattedNumber = await generateInvoiceNumberUtil(organizationId, 'FACT', invoiceNumber);
      setInvoiceNumber(formattedNumber);
      setIsDuplicateNumber(false); // Resetear el estado de duplicado al generar un nuevo número
    } catch (error) {
      console.error('Error al generar número de factura:', error);
      toastError("Error", "No se pudo generar el número de factura automáticamente.");
    }
  };

  // Función para manejar cambios en los items
  const handleItemsChange = (newItems: InvoiceItem[]) => {
    setItems(newItems);
  };

  // Memoizar códigos de impuestos iniciales para edición (evita loop infinito)
  const initialAppliedTaxCodes = useMemo(() => {
    if (esEdicion && facturaInicial) {
      // Prioridad 1: impuestos guardados en invoice_applied_taxes
      if (facturaInicial.applied_taxes && facturaInicial.applied_taxes.length > 0) {
        return facturaInicial.applied_taxes
          .filter((t: any) => t.is_applied)
          .map((t: any) => t.tax_code);
      }
      // Fallback para facturas viejas: usar tax_code de los items
      if (facturaInicial.items) {
        const taxCodes = [...new Set(facturaInicial.items.map((item: any) => item.tax_code).filter(Boolean))];
        if (taxCodes.length > 0) return taxCodes;
      }
    }
    return undefined;
  }, [esEdicion, facturaInicial]);

  // Función para guardar la factura
  const handleSaveInvoice = async () => {
    // Validar que se tenga el número de factura
    if (!invoiceNumber) {
      toastError("Error", "Debe ingresar un número de factura.");
      return;
    }
    
    // Obtener el ID del usuario actual
    const currentUserId = await getCurrentUserId();
    
    if (!currentUserId) {
      toastError("Error", "No se pudo obtener la información del usuario actual.");
      return;
    }
    
    if (!organizationId) {
      toastError("Error", "No se pudo determinar la organización activa.");
      return;
    }
    
    if (!selectedCustomerId) {
      toastError("Error", "Debe seleccionar un cliente para la factura.");
      return;
    }
    
    if (items.length === 0) {
      toastError("Error", "Debe agregar al menos un ítem a la factura.");
      return;
    }

    // Validar que todos los productos con track_serial tengan seriales seleccionados
    const serializedItems = items.filter(
      (it) => it.track_serial === true && it.product_id != null
    );
    const serialSelectionsComplete = serializedItems.every(
      (it) => (serialSelections[it.product_id as number]?.length ?? 0) === it.qty
    );
    if (serializedItems.length > 0 && !serialSelectionsComplete) {
      toastError(
        "Seriales requeridos",
        "Hay productos que requieren captura de seriales. Selecciónalos antes de guardar la factura."
      );
      return;
    }

    // En modo edición, omitir validación de duplicado (es el mismo número)
    if (!esEdicion) {
      const isDuplicate = await checkDuplicateInvoiceNumber(invoiceNumber);
      if (isDuplicate) {
        return;
      }
    }

    // Totales SIEMPRE recalculados desde los items (fuente de verdad), en vez de
    // confiar en los estados subtotal/taxTotal/total que llegan de forma asíncrona
    // desde ImpuestosFactura y pueden quedar desincronizados si se guarda justo
    // después de agregar/editar un ítem (causaba facturas con subtotal/total
    // distintos a la suma real de sus ítems).
    // total_line de cada ítem SIEMPRE es el total final de esa línea (con impuesto
    // incluido o sumado, según corresponda), por lo que su suma es el total real.
    const itemsTotal = items.reduce((sum, it) => sum + (Number(it.total_line) || 0), 0);
    const itemsTaxTotal = items.reduce((sum, it) => {
      const qty = Number(it.qty) || 0;
      const unitPrice = Number(it.unit_price) || 0;
      const discount = Number(it.discount_amount) || 0;
      const rate = Number(it.tax_rate) || 0;
      const totalLine = Number(it.total_line) || 0;
      if (rate <= 0) return sum;
      const lineBase = qty * unitPrice - discount;
      if (it.tax_included) {
        const base = totalLine / (1 + rate / 100);
        return sum + (totalLine - base);
      }
      return sum + (totalLine - lineBase);
    }, 0);
    const itemsSubtotal = itemsTotal - itemsTaxTotal;

    const safeSubtotal = itemsSubtotal;
    const safeTaxTotal = itemsTaxTotal;
    const safeTotal = itemsTotal;

    // Si estamos en modo edición, delegar al onSubmit del padre
    if (esEdicion && onSubmit) {
      const datosFactura = {
        number: invoiceNumber,
        customer_id: selectedCustomerId,
        branch_id: branchId,
        issue_date: issueDate ? toLocalDateString(issueDate) : null,
        due_date: dueDate ? toLocalDateString(dueDate) : null,
        currency,
        payment_terms: paymentTerms,
        payment_method: paymentMethodCode || null,
        notes: notes || null,
        tax_included: taxIncluded,
        subtotal: safeSubtotal,
        tax_total: safeTaxTotal,
        total: safeTotal,
        salesperson_id: salespersonId || null,
        opportunity_id: selectedOpportunityId !== 'none' ? selectedOpportunityId : null,
        commission_rate: commissionRate || 0,
        commission_type: salespersonId && commissionRate > 0 ? commissionType : 'none',
        commission_method: salespersonId && commissionRate > 0 ? commissionMethod : 'percentage',
        commission_amount: salespersonId && commissionRate > 0
          ? (commissionMethod === 'fixed_amount' ? commissionRate : Math.round((safeSubtotal > 0 ? safeSubtotal : safeTotal) * commissionRate / 100 * 100) / 100)
          : 0,
        appliedTaxes,
        items: items.map(item => ({
          id: item.id,
          product_id: item.product_id,
          description: item.description,
          qty: item.qty,
          unit_price: item.unit_price,
          tax_code: item.tax_code,
          tax_rate: item.tax_rate,
          tax_included: item.tax_included || false,
          total_line: item.total_line,
          discount_amount: item.discount_amount || 0
        })),
        serial_selections: serializedItems.length > 0 ? serialSelections : undefined
      };
      await onSubmit(datosFactura);
      return;
    }

    try {
      setIsLoading(true);
      
      // 1. Primero crear el registro en sales
      const sale = {
        organization_id: Number(organizationId),
        branch_id: branchId,
        customer_id: selectedCustomerId || null,
        user_id: currentUserId,
        sale_date: issueDate?.toISOString() || new Date().toISOString(),
        subtotal: safeSubtotal,
        tax_total: safeTaxTotal,
        total: safeTotal,
        balance: safeTotal, // Al crear, el balance es igual al total
        status: 'pending', // Estado permitido por la restricción sales_status_check
        payment_status: 'pending', // Por defecto pendiente de pago
        notes: notes,
        discount_total: 0 // Valor por defecto
      };
      
      // Guardar venta en Supabase
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert(sale)
        .select()
        .single();
        
      if (saleError) throw saleError;
      
      // 2. Crear los items de venta
      const saleItemPromises = items.map(item => {
        return supabase
          .from('sale_items')
          .insert({
            sale_id: saleData.id,
            product_id: item.product_id,
            quantity: item.qty,
            unit_price: item.unit_price,
            total: item.total_line,
            tax_rate: item.tax_rate || 0,
            tax_amount: (item.total_line * (item.tax_rate || 0)) / 100,
            discount_amount: item.discount_amount || 0
          });
      });
      
      // Guardar items de venta
      const saleItemsResults = await Promise.all(saleItemPromises);
      
      // Verificar si alguna promesa tuvo error
      const saleItemsError = saleItemsResults.find(result => result.error);
      if (saleItemsError) throw saleItemsError.error;

      // 2.5. Vender seriales si hay productos serializados con seriales seleccionados
      // (mismo flujo que el POS: serialTrackingService.sellSerials por cada producto)
      if (serializedItems.length > 0 && serialSelections) {
        try {
          for (const item of serializedItems) {
            const serialIds = serialSelections[item.product_id as number];
            if (!serialIds || serialIds.length === 0) continue;

            const { success: serialOk, errors: serialErrors } = await serialTrackingService.sellSerials(
              serialIds,
              {
                sale_id: saleData.id,
                customer_id: selectedCustomerId || undefined,
                sold_by_user_id: currentUserId,
                sale_channel: 'invoice',
                price_at_sale: item.unit_price,
                branch_id: branchId,
              },
              currentUserId
            );

            if (!serialOk) {
              console.warn(`⚠️ Errores vendiendo seriales para producto ${item.product_id}:`, serialErrors);
            }
          }
        } catch (serialError) {
          console.warn('⚠️ Error vendiendo seriales (no bloquea la factura):', serialError);
        }
      }

      // 3. Crear objeto de factura con el sale_id
      const invoice: Invoice = {
        organization_id: Number(organizationId),
        branch_id: branchId,
        customer_id: selectedCustomerId || null,
        sale_id: saleData.id, // Vinculamos con la venta creada
        number: invoiceNumber,
        issue_date: issueDate ? toLocalDateString(issueDate) : null,
        due_date: dueDate ? toLocalDateString(dueDate) : null,
        currency: currency, // Moneda seleccionada por el usuario
        subtotal: safeSubtotal,
        tax_total: safeTaxTotal,
        total: safeTotal,
        balance: safeTotal, // Al crear, el balance es igual al total
        status: 'draft', // Por defecto
        payment_terms: paymentTerms,
        payment_method: paymentMethodCode,
        notes: notes,
        tax_included: taxIncluded, // Agregamos el campo tax_included
        created_by: currentUserId, // Asignamos el ID del usuario actual
      };

      // Añadir opportunity_id si se seleccionó una oportunidad
      const invoiceWithOpportunity = selectedOpportunityId !== 'none'
        ? { ...invoice, opportunity_id: selectedOpportunityId }
        : invoice;
      
      // Añadir campos de comisión al insert
      const commissionAmountCalc = salespersonId && commissionRate > 0
        ? (commissionMethod === 'fixed_amount' ? commissionRate : Math.round((safeSubtotal > 0 ? safeSubtotal : safeTotal) * commissionRate / 100 * 100) / 100)
        : 0;
      const invoiceWithCommission = {
        ...invoiceWithOpportunity,
        salesperson_id: salespersonId || null,
        commission_rate: commissionRate || 0,
        commission_type: salespersonId && commissionRate > 0 ? commissionType : 'none',
        commission_method: salespersonId && commissionRate > 0 ? commissionMethod : 'percentage',
        commission_amount: commissionAmountCalc
      };
      
      // 4. Guardar factura en Supabase
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoice_sales')
        .insert(invoiceWithCommission)
        .select()
        .single();
        
      if (invoiceError) throw invoiceError;
      
      // 5. Preparar ítems para guardar con el ID de la factura.
      // IMPORTANTE: se insertan todos en UNA sola llamada (un solo INSERT/transacción)
      // en vez de una promesa por ítem. El trigger fn_recalc_invoice_totals() recalcula
      // subtotal/total de invoice_sales sumando invoice_items en cada INSERT; con
      // inserts paralelos (Promise.all de N .insert() separados = N transacciones
      // concurrentes) cada trigger solo veía los ítems ya confirmados en ese instante,
      // y el último en confirmar sobrescribía el total con una suma parcial. Un único
      // INSERT masivo dispara el trigger dentro de la misma transacción, donde todas
      // las filas ya son visibles entre sí.
      const invoiceItemsToInsert = items.map(item => ({
        invoice_sales_id: invoiceData.id, // Usamos el ID UUID de la factura
        invoice_id: invoiceData.id, // Por compatibilidad con código existente
        product_id: item.product_id,
        description: item.description,
        qty: item.qty,
        unit_price: item.unit_price,
        tax_code: item.tax_code,
        tax_rate: item.tax_rate,
        tax_included: item.tax_included || false, // Guardamos si el impuesto está incluido
        total_line: item.total_line,
        discount_amount: item.discount_amount || 0,
        invoice_type: 'sale' // Tipo de factura (venta)
      }));

      // 6. Guardar ítems de factura
      // Si el insert falla por RLS o constraints, la factura queda sin items ni totales
      // (causa raiz del bug de facturas con total=0). El fallback fn_sync_invoice_items_from_sale
      // copia desde sale_items via RPC (SECURITY DEFINER, bypassa RLS) y el trigger
      // fn_recalc_invoice_totals recalcula subtotal/total/balance automaticamente.
      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(invoiceItemsToInsert);

      if (itemsError) {
        console.warn('Insert directo de invoice_items falló, sincronizando desde sale_items:', itemsError);
        const { data: syncedCount, error: syncError } = await supabase
          .rpc('fn_sync_invoice_items_from_sale', { p_invoice_id: invoiceData.id });
        if (syncError) throw syncError;
        if (!syncedCount || syncedCount === 0) throw itemsError;
      } else {
        // Verificar que los items se insertaron realmente (RLS puede filtrar silenciosamente)
        const { count } = await supabase
          .from('invoice_items')
          .select('*', { count: 'exact', head: true })
          .eq('invoice_sales_id', invoiceData.id);
        if (!count || count === 0) {
          console.warn('invoice_items no se insertaron (posible RLS), sincronizando desde sale_items');
          const { error: syncError } = await supabase
            .rpc('fn_sync_invoice_items_from_sale', { p_invoice_id: invoiceData.id });
          if (syncError) throw syncError;
        }
      }
      
      // 6.5. Guardar impuestos aplicados en invoice_applied_taxes
      const appliedTaxCodes = Object.keys(appliedTaxes).filter(code => appliedTaxes[code]);
      if (appliedTaxCodes.length > 0) {
        const taxRows = appliedTaxCodes.map(code => ({
          invoice_id: invoiceData.id,
          tax_code: code,
          tax_rate: appliedTaxTotals[code]?.rate || 0,
          is_applied: true
        }));
        const { error: taxInsertError } = await supabase
          .from('invoice_applied_taxes')
          .insert(taxRows);
        if (taxInsertError) console.warn('Error guardando impuestos aplicados:', taxInsertError);
      }

      // Nota: el asiento contable de devengo se crea automaticamente en la BD
      // mediante el trigger trg_auto_journal_sale (fn_auto_journal_sale) al
      // insertar en invoice_sales, usando la tabla accounting_rules.

      // 6.6. Crear registro de comisión si aplica
      if (salespersonId && commissionRate > 0 && commissionType !== 'none') {
        try {
          const salespersonName = organizationMembers.find(m => m.id === salespersonId)?.name || 'N/A';
          const baseAmount = subtotal > 0 ? subtotal : total;

          const { error: commissionInsertError } = await supabase
            .from('commissions')
            .insert({
              organization_id: Number(organizationId),
              branch_id: branchId,
              commission_type: commissionType,
              source_type: 'invoice_sale',
              source_id: invoiceData.id,
              payee_type: 'employee',
              payee_id: salespersonId,
              payee_name: salespersonName,
              base_amount: baseAmount,
              commission_rate: commissionRate,
              commission_amount: commissionAmountCalc,
              currency: currency,
              status: 'accrued',
              accrued_at: new Date().toISOString(),
              created_by: currentUserId,
              metadata: { invoice_number: invoiceNumber, commission_method: commissionMethod },
            });
          if (commissionInsertError) {
            console.error('Error al crear registro de comisión:', commissionInsertError);
          }
        } catch (commissionErr) {
          console.error('Error al crear registro de comisión (catch):', commissionErr);
        }
      }

      // 6.6. Avisar si la factura no tiene existencias para emitirse.
      // Guardar un borrador no compromete inventario, asi que no se bloquea: el
      // bloqueo esta en la emision, que es cuando la mercancia sale. Esto solo
      // evita la sorpresa de descubrirlo al final. La comprobacion corre sobre la
      // factura ya guardada porque debe expandir las recetas igual que el descuento.
      try {
        const { data: faltantes } = await supabase
          .rpc('fn_invoice_stock_shortages', { p_invoice_id: invoiceData.id });

        if (faltantes && faltantes.length > 0) {
          const detalle = faltantes
            .map((f: any) => `${f.product_name}: necesita ${f.required}, hay ${f.available}`)
            .join(' | ');

          toastError('Guardada, pero sin existencias para emitir', `${detalle}. Repon el inventario antes de emitirla.`);
        }
      } catch (stockCheckError) {
        console.warn('No se pudo verificar el stock de la factura guardada:', stockCheckError);
      }

      // 7. Si está activada la opción de factura electrónica, enviar a DIAN
      if (sendToFactus) {
        try {
          const result = await electronicInvoicingService.sendToFactus(
            invoiceData.id,
            Number(organizationId)
          );
          
          if (result.success) {
            toastSuccess("Factura creada y enviada a DIAN", `La factura ${invoiceNumber} se ha creado y enviado para validación electrónica.`);
          } else {
            toastError("Factura creada", `La factura se creó pero hubo un error al enviar a DIAN: ${result.error}`);
          }
        } catch (eInvoiceError) {
          console.error('Error al enviar a Factus:', eInvoiceError);
          toastSuccess("Factura creada", "La factura se creó correctamente pero no se pudo enviar a DIAN. Puede intentarlo desde el detalle de la factura.");
        }
      } else {
        toastSuccess("Éxito", "La factura se ha creado correctamente.");
      }
      
      // Redireccionar a la vista de la factura
      router.push(`/app/finanzas/facturas-venta/${invoiceData.id.toString()}`);
      
    } catch (error) {
      console.error('Error al guardar la factura:', error);
      toastError("Error", `Ocurrió un error al guardar la factura: ${JSON.stringify(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Información general de factura */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invoice-number" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Número de Factura
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="invoice-number"
              value={invoiceNumber}
              onChange={(e) => {
                const value = e.target.value;
                setInvoiceNumber(value);
                setIsDuplicateNumber(false);
              }}
              onBlur={() => {
                if (invoiceNumber) {
                  checkDuplicateInvoiceNumber(invoiceNumber);
                }
                // En modo edición, resetear isDuplicateNumber si la validación pasa
              }}
              placeholder="Ej: FACT-00001"
              required
              className={`
                flex-1 text-sm
                bg-white dark:bg-gray-900
                border-gray-300 dark:border-gray-600
                text-gray-900 dark:text-gray-100
                placeholder:text-gray-500 dark:placeholder:text-gray-400
                ${isDuplicateNumber ? 'border-red-500 dark:border-red-400' : ''}
              `}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={generateInvoiceNumber}
              disabled={isLoading}
              title="Generar número automático"
              className="
                flex-shrink-0 h-9 w-9 p-0
                bg-white dark:bg-gray-800
                border-gray-300 dark:border-gray-600
                hover:bg-gray-50 dark:hover:bg-gray-700
                text-gray-700 dark:text-gray-200
              "
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          {isDuplicateNumber && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">Este número de factura ya existe.</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="issue-date" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Fecha de Emisión
          </Label>
          <DatePicker
            date={issueDate}
            onSelect={(date) => {
              setIssueDate(date);

              if (date) {
                const newDueDate = new Date(date);
                newDueDate.setDate(newDueDate.getDate() + paymentTerms);
                setDueDate(newDueDate);
              }
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="due-date" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Fecha de Vencimiento
          </Label>
          <DatePicker
            date={dueDate}
            onSelect={setDueDate}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currency" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            <span className="flex items-center gap-1.5">
              <Coins className="h-3.5 w-3.5" />
              Moneda
            </span>
          </Label>
          <Select 
            value={currency} 
            onValueChange={setCurrency}
            disabled={loadingCurrencies}
          >
            <SelectTrigger className="
              w-full text-sm
              bg-white dark:bg-gray-900
              border-gray-300 dark:border-gray-600
              text-gray-900 dark:text-gray-100
            ">
              <SelectValue placeholder={loadingCurrencies ? "Cargando..." : "Seleccionar moneda"} />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              {currencies.map((curr) => (
                <SelectItem 
                  key={curr.code} 
                  value={curr.code}
                  className="text-gray-900 dark:text-gray-100"
                >
                  {curr.code} - {curr.name} ({curr.symbol})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      
      {/* Selector de Cliente */}
      <div className="
        border border-gray-200 dark:border-gray-700
        bg-gray-50/50 dark:bg-gray-900/30
        p-3 sm:p-4
        rounded-lg
      ">
        <h3 className="text-sm sm:text-base font-semibold mb-3 text-gray-900 dark:text-gray-100">
          Datos del Cliente
        </h3>
        <ClienteSelector 
          selectedCustomerId={selectedCustomerId} 
          onCustomerChange={setSelectedCustomerId}
        />
      </div>
      
      {/* Selector de Oportunidad (opcional) */}
      {opportunities.length > 0 && (
        <div className="
          border border-gray-200 dark:border-gray-700
          bg-gray-50/50 dark:bg-gray-900/30
          p-3 sm:p-4
          rounded-lg
        ">
          <h3 className="text-sm sm:text-base font-semibold mb-3 text-gray-900 dark:text-gray-100">
            Oportunidad (opcional)
          </h3>
          <div className="flex flex-col gap-1.5">
            <Select value={selectedOpportunityId} onValueChange={handleOpportunityChange}>
              <SelectTrigger className="
                w-full text-sm
                bg-white dark:bg-gray-900
                border-gray-300 dark:border-gray-600
                text-gray-900 dark:text-gray-100
              ">
                <SelectValue placeholder="Sin oportunidad asociada" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <SelectItem value="none" className="text-gray-900 dark:text-gray-100">Sin oportunidad asociada</SelectItem>
                {opportunities.map((opp) => (
                  <SelectItem key={opp.id} value={opp.id} className="text-gray-900 dark:text-gray-100">
                    {opp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedOpportunityId !== 'none' && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Al seleccionar una oportunidad, se cargan sus productos y se asocia la factura a ella.
              </p>
            )}
          </div>
        </div>
      )}
      
      {/* Items de Factura */}
      <div className="
        border border-gray-200 dark:border-gray-700
        bg-gray-50/50 dark:bg-gray-900/30
        p-3 sm:p-4
        rounded-lg
      ">
        <h3 className="text-sm sm:text-base font-semibold mb-3 text-gray-900 dark:text-gray-100">
          Items de la Factura
        </h3>
        <ItemsFactura
          items={items}
          onItemsChange={handleItemsChange}
          taxIncluded={taxIncluded}
          branchId={branchId}
          organizationId={organizationId ? Number(organizationId) : undefined}
          serialSelections={serialSelections}
          onSerialSelectionsChange={setSerialSelections}
        />
      </div>
      
      {/* El componente ImpuestosFactura se ha movido después de las condiciones de pago para evitar duplicación */}
      
      {/* Información de Pago */}
      <div className="
        border border-gray-200 dark:border-gray-700
        bg-gray-50/50 dark:bg-gray-900/30
        p-3 sm:p-4
        rounded-lg
      ">
        <h3 className="text-sm sm:text-base font-semibold mb-3 text-gray-900 dark:text-gray-100">
          Condiciones de Pago
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          <div>
            <Label htmlFor="payment-terms" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
              Términos de Pago
            </Label>
            <div className="flex flex-col space-y-2">
              <Select 
                value={isCustomPaymentTerm ? "custom" : paymentTerms.toString()}
                onValueChange={(value) => {
                  if (value === "custom") {
                    setIsCustomPaymentTerm(true);
                    return;
                  }
                  
                  setIsCustomPaymentTerm(false);
                  const days = parseInt(value);
                  setPaymentTerms(days);
                  
                  if (issueDate) {
                    const newDueDate = new Date(issueDate);
                    newDueDate.setDate(newDueDate.getDate() + days);
                    setDueDate(newDueDate);
                  }
                }}
              >
                <SelectTrigger className="
                  w-full text-sm
                  bg-white dark:bg-gray-900
                  border-gray-300 dark:border-gray-600
                  text-gray-900 dark:text-gray-100
                ">
                  <SelectValue placeholder="Seleccionar términos">
                    {isCustomPaymentTerm 
                      ? `Personalizado: ${paymentTerms} días` 
                      : (paymentTerms === 0 ? 'Contado' : `${paymentTerms} días`)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <SelectItem value="0" className="text-gray-900 dark:text-gray-100">Contado</SelectItem>
                  <SelectItem value="15" className="text-gray-900 dark:text-gray-100">15 días</SelectItem>
                  <SelectItem value="30" className="text-gray-900 dark:text-gray-100">30 días</SelectItem>
                  <SelectItem value="45" className="text-gray-900 dark:text-gray-100">45 días</SelectItem>
                  <SelectItem value="60" className="text-gray-900 dark:text-gray-100">60 días</SelectItem>
                  <SelectItem value="90" className="text-gray-900 dark:text-gray-100">90 días</SelectItem>
                  <SelectItem value="custom" className="text-gray-900 dark:text-gray-100">Personalizado</SelectItem>
                </SelectContent>
              </Select>
              
              {isCustomPaymentTerm && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={paymentTerms}
                    onChange={(e) => {
                      const days = parseInt(e.target.value) || 1;
                      setPaymentTerms(days);
                      
                      if (issueDate) {
                        const newDueDate = new Date(issueDate);
                        newDueDate.setDate(newDueDate.getDate() + days);
                        setDueDate(newDueDate);
                      }
                    }}
                    className="
                      w-20 sm:w-24 text-sm
                      bg-white dark:bg-gray-900
                      border-gray-300 dark:border-gray-600
                      text-gray-900 dark:text-gray-100
                    "
                  />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">días</span>
                </div>
              )}
            </div>
          </div>
          <div>
            <FormaPagoSelector 
              formaPago={paymentMethodCode} 
              onChange={setPaymentMethodCode} 
            />
          </div>
          <div className="lg:col-span-2">
            <Label htmlFor="notes" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
              Notas
            </Label>
            <Input 
              id="notes" 
              value={notes} 
              onChange={e => setNotes(e.target.value)}
              placeholder="Notas adicionales" 
              className="
                text-sm
                bg-white dark:bg-gray-900
                border-gray-300 dark:border-gray-600
                text-gray-900 dark:text-gray-100
                placeholder:text-gray-500 dark:placeholder:text-gray-400
              "
            />
          </div>
          <div className="lg:col-span-2 pt-2">
            <div className={`p-2 sm:p-3 rounded-lg flex flex-wrap items-center justify-between ${eInvoiceAlwaysEnabled ? 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800' : ''}`}>
              <ElectronicInvoiceToggle
                checked={sendToFactus}
                onCheckedChange={setSendToFactus}
                disabled={eInvoiceAlwaysEnabled}
                showLabel={true}
                showTooltip={true}
                size="md"
              />
              {eInvoiceAlwaysEnabled && (
                <span className="text-xs text-blue-600 dark:text-blue-400 font-medium ml-2">Global</span>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Impuestos y Totales */}
      <ImpuestosFactura 
        organizationId={organizationId}
        items={items}
        taxIncluded={taxIncluded}
        initialAppliedTaxCodes={initialAppliedTaxCodes}
        onTaxIncludedChange={(value) => {
          setTaxIncluded(value);
          
          // Actualizar todos los ítems existentes para que usen el nuevo valor
          const updatedItems = items.map(item => ({
            ...item,
            tax_included: value
          }));
          
          setItems(updatedItems);
        }}
        onAppliedTaxesChange={setAppliedTaxes}
        onTaxTotalsChange={setAppliedTaxTotals}
        onSubtotalCalculated={setSubtotal}
        onTaxTotalCalculated={setTaxTotal}
        onTotalCalculated={setTotal}
      />

      {/* Sección de Comisión de Vendedor */}
      <div className="
        border border-gray-200 dark:border-gray-700
        bg-gray-50/50 dark:bg-gray-900/30
        p-3 sm:p-4
        rounded-lg
      ">
        <h3 className="text-sm sm:text-base font-semibold mb-3 text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <User className="h-4 w-4 text-blue-500" />
          Comisión de Vendedor (opcional)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div>
            <Label htmlFor="salesperson" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
              Vendedor
            </Label>
            <SearchSelect
              options={organizationMembers.map((m) => ({ value: m.id, label: m.name }))}
              value={salespersonId}
              onValueChange={setSalespersonId}
              placeholder="Seleccionar vendedor"
              searchPlaceholder="Buscar vendedor..."
              noneLabel="Sin asignar"
              noneValue="__none__"
              className="bg-white dark:bg-gray-900 dark:text-gray-200 border-gray-300 dark:border-gray-600"
            />
          </div>
          <div>
            <Label htmlFor="commission-rate" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
              Comisión
            </Label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                {commissionMethod === 'percentage' ? <Percent className="h-3.5 w-3.5" /> : <DollarSign className="h-3.5 w-3.5" />}
              </span>
              <Input
                id="commission-rate"
                type="number"
                min="0"
                max={commissionMethod === 'percentage' ? "100" : undefined}
                step={commissionMethod === 'percentage' ? "0.5" : "100"}
                value={commissionRate || ''}
                onChange={(e) => setCommissionRate(Number(e.target.value) || 0)}
                placeholder="0"
                className={`
                  text-sm pl-8
                  bg-white dark:bg-gray-900
                  text-gray-900 dark:text-gray-100
                  ${commissionMethod === 'percentage' && commissionRate > 100
                    ? 'border-red-500 dark:border-red-500 text-red-600 dark:text-red-400'
                    : commissionMethod === 'fixed_amount' && commissionRate > (subtotal > 0 ? subtotal : total)
                    ? 'border-red-500 dark:border-red-500 text-red-600 dark:text-red-400'
                    : 'border-gray-300 dark:border-gray-600'
                  }
                `
                }
              />
              {((commissionMethod === 'percentage' && commissionRate > 100) ||
                (commissionMethod === 'fixed_amount' && commissionRate > (subtotal > 0 ? subtotal : total))) && commissionRate > 0 && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-red-500 dark:text-red-400">
                  <AlertCircle className="h-4 w-4" />
                </span>
              )}
            </div>
            <div className="flex gap-1 mt-1.5">
              <Button
                type="button"
                variant={commissionMethod === 'percentage' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCommissionMethod('percentage')}
                className="h-7 px-2 text-xs"
              >
                <Percent className="h-3 w-3 mr-1" /> Porcentaje
              </Button>
              <Button
                type="button"
                variant={commissionMethod === 'fixed_amount' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCommissionMethod('fixed_amount')}
                className="h-7 px-2 text-xs"
              >
                <DollarSign className="h-3 w-3 mr-1" /> Monto Fijo
              </Button>
            </div>
            {commissionMethod === 'percentage' && commissionRate > 100 && (
              <p className="text-xs text-red-500 dark:text-red-400 mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                El porcentaje no puede superar 100%
              </p>
            )}
            {commissionMethod === 'fixed_amount' && commissionRate > (subtotal > 0 ? subtotal : total) && commissionRate > 0 && (
              <p className="text-xs text-red-500 dark:text-red-400 mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                El monto supera el total de la factura
              </p>
            )}
          </div>
        </div>
        {salespersonId && salespersonId !== '__none__' && commissionRate > 0 && (
          <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="flex justify-between items-center text-sm">
              <span className="text-blue-700 dark:text-blue-400">
                Comisión estimada ({commissionMethod === 'percentage' ? `${commissionRate}%` : formatCurrency(commissionRate)}):
              </span>
              <span className="font-semibold text-blue-700 dark:text-blue-400">
                {new Intl.NumberFormat('es-CO', { style: 'currency', currency: currency || 'COP' }).format(
                  commissionMethod === 'fixed_amount' ? commissionRate : (itemsSubtotalForCommission > 0 ? itemsSubtotalForCommission : itemsTotalForCommission) * commissionRate / 100
                )}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Botones de Acción */}
      <div className="
        flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 
        pt-4 sm:pt-6
        border-t border-gray-200 dark:border-gray-700
      ">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.back()}
          disabled={isLoading}
          className="
            w-full sm:w-auto
            bg-white dark:bg-gray-800
            border-gray-300 dark:border-gray-600
            hover:bg-gray-50 dark:hover:bg-gray-700
            text-gray-700 dark:text-gray-200
          "
        >
          <ArrowLeft className="w-4 h-4 mr-2 flex-shrink-0" />
          <span className="text-sm">Cancelar</span>
        </Button>
        <Button
          size="sm"
          onClick={handleSaveInvoice}
          disabled={isLoading || saving}
          className="
            w-full sm:w-auto
            bg-blue-600 hover:bg-blue-700
            dark:bg-blue-600 dark:hover:bg-blue-500
            text-white
            shadow-sm
          "
        >
          <Save className="w-4 h-4 mr-2 flex-shrink-0" />
          <span className="text-sm">{(isLoading || saving) ? 'Guardando...' : esEdicion ? 'Guardar Cambios' : 'Guardar Factura'}</span>
        </Button>
      </div>
    </div>
  );
}
