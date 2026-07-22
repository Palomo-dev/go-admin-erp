'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Plus,
  Receipt,
  RefreshCw,
  Users,
  Clock,
  ChefHat,
  CheckCircle,
  UserCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchSelect } from '@/components/ui/search-select';
import { formatCurrency } from '@/utils/Utils';
import { AddProductDialog } from '@/components/pos/mesas/id/AddProductDialog';
import { OrderItemCard } from '@/components/pos/mesas/id/OrderItemCard';
import { PreCuentaDialog } from '@/components/pos/mesas/id/PreCuentaDialog';
import { TransferItemDialog } from '@/components/pos/mesas/id/TransferItemDialog';
import { CheckoutDialog } from '@/components/pos/CheckoutDialog';
import { type OccupiedSpace } from '@/components/pos/CustomerSelector';
import { MesaDetailHeader } from '@/components/pos/mesas/id/MesaDetailHeader';
import { MesaStatsCards } from '@/components/pos/mesas/id/MesaStatsCards';
import { MesaActionsSidebar } from '@/components/pos/mesas/id/MesaActionsSidebar';
import { SessionTimelineDialog } from '@/components/pos/mesas/id/SessionTimelineDialog';
import { CombinarMesasDialog } from '@/components/pos/mesas/CombinarMesasDialog';
import { SplitBillDialog, type BillSplit } from '@/components/pos/mesas/id/SplitBillDialog';
import { SplitPaymentSelector } from '@/components/pos/mesas/id/SplitPaymentSelector';
import { PedidosService } from '@/components/pos/mesas/id/pedidosService';
import { MesasService } from '@/components/pos/mesas/mesasService';
import { PrintService } from '@/lib/services/printService';
import { PrintJobsService } from '@/lib/services/printJobsService';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { branchService } from '@/lib/services/branchService';
import type {
  TableSessionWithDetails,
  ProductToAdd,
  PreCuenta,
  SaleItem,
} from '@/components/pos/mesas/id/types';
import type { Cart, Customer, Sale, CheckoutData } from '@/components/pos/types';
import type { TableWithSession } from '@/components/pos/mesas/types';

export default function MesaDetallePage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { organization, branch_id } = useOrganization();
  const tableId = params.id as string; // UUID
  const [currentBranch, setCurrentBranch] = useState<any>(null);

  const [session, setSession] = useState<TableSessionWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showPreCuenta, setShowPreCuenta] = useState(false);
  const [preCuenta, setPreCuenta] = useState<PreCuenta | null>(null);
  const [itemToTransfer, setItemToTransfer] = useState<SaleItem | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | undefined>();
  const [selectedRoom, setSelectedRoom] = useState<OccupiedSpace | undefined>();
  const [showCombinar, setShowCombinar] = useState(false);
  const [todasLasMesas, setTodasLasMesas] = useState<TableWithSession[]>([]);
  const [showEditarComensales, setShowEditarComensales] = useState(false);
  const [comensalesInput, setComensalesInput] = useState(2);
  const [showSplitBill, setShowSplitBill] = useState(false);
  const [billSplits, setBillSplits] = useState<BillSplit[] | null>(null);
  const [currentSplitIndex, setCurrentSplitIndex] = useState(0);
  const [paidSplitIds, setPaidSplitIds] = useState<string[]>([]);
  const [showSplitSelector, setShowSplitSelector] = useState(false);
  const [mesaNombre, setMesaNombre] = useState<string>('Mesa');
  const [serverName, setServerName] = useState<string | undefined>();
  const [showEditarMesero, setShowEditarMesero] = useState(false);
  const [meseroSeleccionado, setMeseroSeleccionado] = useState<string>('');
  const [orgMembers, setOrgMembers] = useState<{ value: string; label: string; sublabel?: string }[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [showHistorial, setShowHistorial] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, [tableId]);

  // Suscripción realtime para kitchen_ticket_items (actualizar estados de cocina)
  useEffect(() => {
    if (!session?.id) return;
    const { supabase } = require('@/lib/supabase/config');
    const channel = supabase
      .channel(`kitchen-ticket-items-${session.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kitchen_ticket_items', filter: `organization_id=eq.${session.organization_id}` },
        () => {
          cargarDatos();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kitchen_tickets', filter: `table_session_id=eq.${session.id}` },
        () => {
          cargarDatos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.id]);

  // Cargar información de la sucursal
  useEffect(() => {
    const loadBranch = async () => {
      if (branch_id) {
        try {
          const branchData = await branchService.getBranchById(branch_id);
          setCurrentBranch(branchData);
        } catch (error) {
          console.error('Error cargando sucursal:', error);
        }
      }
    };
    loadBranch();
  }, [branch_id]);

  // Cargar nombre de mesa (con o sin sesión)
  useEffect(() => {
    const cargarNombreMesa = async () => {
      if (session?.restaurant_tables?.name) {
        setMesaNombre(session.restaurant_tables.name);
      } else {
        // Si no hay sesión, cargar el nombre de la mesa directamente
        try {
          const { supabase } = await import('@/lib/supabase/config');
          const { data } = await supabase
            .from('restaurant_tables')
            .select('name, zone')
            .eq('id', tableId)
            .single();
          if (data) {
            setMesaNombre(data.name || 'Mesa');
          }
        } catch (error) {
          console.error('Error cargando nombre de mesa:', error);
        }
      }
    };
    cargarNombreMesa();
  }, [session, tableId]);

  const cargarDatos = async () => {
    setIsLoading(true);
    try {
      const detalles = await PedidosService.obtenerDetalleMesa(tableId);
      
      if (!detalles) {
        // No hay sesión activa, NO crear automáticamente
        // La sesión se creará cuando se agregue el primer producto o cliente
        setSession(null);
        setSelectedCustomer(undefined);
        setSelectedRoom(undefined);
      } else {
        setSession(detalles);
        
        // Cargar nombre del mesero (server_id)
        if (detalles.server_id) {
          const { supabase } = await import('@/lib/supabase/config');
          const { data: serverProfile } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', detalles.server_id)
            .single();
          if (serverProfile) {
            const name = `${serverProfile.first_name || ''} ${serverProfile.last_name || ''}`.trim() ||
              undefined;
            setServerName(name);
          } else {
            setServerName(undefined);
          }
        } else {
          setServerName(undefined);
        }
        
        // Si la venta tiene customer_id, cargar el customer
        if (detalles.sales?.customer_id) {
          const { supabase } = await import('@/lib/supabase/config');
          const { data: customer } = await supabase
            .from('customers')
            .select('*')
            .eq('id', detalles.sales.customer_id)
            .single();
          
          if (customer) {
            setSelectedCustomer(customer);
          }
          
          // Si además tiene reservation_id, intentar cargar info del espacio
          if (detalles.sales.reservation_id) {
            const { data: reservation } = await supabase
              .from('reservations')
              .select(`
                id,
                checkin,
                checkout,
                reservation_spaces!inner (
                  space_id,
                  spaces!inner (
                    id,
                    label
                  )
                ),
                folios!inner (
                  id
                )
              `)
              .eq('id', detalles.sales.reservation_id)
              .single();
            
            if (reservation && reservation.reservation_spaces?.[0]) {
              const reservationSpace = reservation.reservation_spaces[0];
              const space = Array.isArray(reservationSpace.spaces) 
                ? reservationSpace.spaces[0] 
                : reservationSpace.spaces;
              
              const room: OccupiedSpace = {
                space_id: space.id,
                space_label: space.label,
                reservation_id: reservation.id,
                customer_id: customer.id,
                customer_name: customer.full_name,
                customer_email: customer.email,
                customer_phone: customer.phone,
                checkin: reservation.checkin,
                checkout: reservation.checkout,
                folio_id: reservation.folios?.[0]?.id,
              };
              setSelectedRoom(room);
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: error?.message || 'No se pudieron cargar los detalles de la mesa',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Función auxiliar para crear sesión si no existe
  const asegurarSesion = async (): Promise<TableSessionWithDetails> => {
    if (session) {
      // Si la sesión existe pero no tiene server_id, asignar el usuario actual
      if (!session.server_id) {
        const { supabase } = await import('@/lib/supabase/config');
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from('table_sessions')
            .update({ server_id: user.id })
            .eq('id', session.id);
          // Cargar perfil del usuario
          const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', user.id)
            .single();
          if (profile) {
            const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() ||
              undefined;
            setServerName(name);
          }
          setSession({ ...session, server_id: user.id });
        }
      }
      return session;
    }

    // Crear nueva sesión
    const { supabase } = await import('@/lib/supabase/config');
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      throw new Error('Usuario no autenticado');
    }
    
    const nuevaSesion = await PedidosService.iniciarSesion(
      tableId,
      user.id,
      2
    );
    setSession(nuevaSesion);

    // Establecer serverName inmediatamente con el perfil del usuario actual
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', user.id)
      .single();
    if (profile) {
      const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() ||
        undefined;
      setServerName(name);
    }

    return nuevaSesion;
  };

  const handleAddProducts = async (productos: ProductToAdd[]) => {
    try {
      // Asegurar que exista sesión antes de agregar productos
      const sesionActual = await asegurarSesion();
      
      await PedidosService.agregarProductos(sesionActual.id, productos);
      
      // 🔗 INTEGRACIÓN POS → PMS: Si hay folio asociado, agregar items también al folio
      if (selectedRoom?.folio_id) {
        console.log('Sincronizando items con folio:', selectedRoom.folio_id);
        
        const FoliosService = (await import('@/lib/services/foliosService')).default;
        
        for (const producto of productos) {
          await FoliosService.addFolioItem({
            folio_id: selectedRoom.folio_id,
            source: 'pos',
            description: producto.product_name,
            amount: producto.unit_price * producto.quantity,
            created_by: organization?.user?.id,
          });
        }
        
        console.log('Items sincronizados con folio exitosamente');
      }
      
      await cargarDatos();
      toast({
        title: 'Productos agregados',
        description: selectedRoom?.folio_id 
          ? 'Los productos se han añadido al pedido y al folio de la habitación'
          : 'Los productos se han añadido al pedido',
      });
    } catch (error) {
      console.error('Error agregando productos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron agregar los productos',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleUpdateQuantity = async (itemId: string, newQuantity: number) => {
    try {
      await PedidosService.actualizarCantidadItem(itemId, newQuantity);
      await cargarDatos();
      
      // 🔗 INTEGRACIÓN POS → PMS: Sincronizar folio después de actualizar cantidad
      if (selectedRoom?.folio_id && session) {
        await syncSaleItemsToFolio();
      }
      
      toast({
        title: 'Cantidad actualizada',
        description: 'La cantidad del item se ha actualizado',
      });
    } catch (error) {
      console.error('Error actualizando cantidad:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la cantidad',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await PedidosService.eliminarItem(itemId);
      
      // 🔗 INTEGRACIÓN POS → PMS: Sincronizar folio después de eliminar
      if (selectedRoom?.folio_id && session) {
        await syncSaleItemsToFolio();
      }
      
      await cargarDatos();
      toast({
        title: 'Item eliminado',
        description: 'El item se ha eliminado del pedido',
      });
    } catch (error) {
      console.error('Error eliminando item:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el item',
        variant: 'destructive',
      });
      throw error;
    }
  };

  /**
   * 🔗 Sincronizar items de venta POS con folio de PMS
   * Elimina items POS anteriores del folio y agrega los actuales
   */
  const syncSaleItemsToFolio = async () => {
    if (!selectedRoom?.folio_id || !session?.sale_items) return;

    try {
      console.log('🔄 Sincronizando items de POS con folio...');
      const FoliosService = (await import('@/lib/services/foliosService')).default;
      
      // 1. Obtener todos los items del folio con source='pos'
      const folio = await FoliosService.getFolioById(selectedRoom.folio_id);
      const posItems = folio?.items?.filter(item => item.source === 'pos') || [];
      
      // 2. Eliminar items POS anteriores
      for (const item of posItems) {
        await FoliosService.deleteFolioItem(item.id, selectedRoom.folio_id);
      }
      
      // 3. Agregar items actuales de la venta
      for (const saleItem of session.sale_items) {
        await FoliosService.addFolioItem({
          folio_id: selectedRoom.folio_id,
          source: 'pos',
          description: saleItem.product?.name || 'Producto',
          amount: Number(saleItem.total),
          created_by: organization?.user?.id,
        });
      }
      
      console.log('✅ Folio sincronizado con', session.sale_items.length, 'items');
    } catch (error) {
      console.error('❌ Error sincronizando folio:', error);
    }
  };

  const imprimirPreCuenta = async (cuenta: PreCuenta, forcePDF = false) => {
    // Impresión física por el Print Agent (estación 'cashier'), best-effort.
    // Si hay impresora de caja configurada, sale por ella; si no, fallback al navegador.
    // Si forcePDF=true (botón "Imprimir" del diálogo), salta la física y va directo al PDF.
    if (branch_id && !forcePDF) {
      try {
        const businessInfo = organization ? {
          name: organization.name || '',
          nit: (organization as any).nit || (organization as any).tax_id || '',
          phone: (organization as any).phone || '',
          address: (organization as any).address || '',
          email: (organization as any).email || '',
          city: (organization as any).city || '',
          fiscalResponsibilities: (organization as any).fiscal_responsibilities || null,
        } : undefined;
        const branchInfo = currentBranch ? {
          name: currentBranch.name || '',
          address: currentBranch.address || '',
          phone: currentBranch.phone || '',
        } : undefined;

        const { enqueued } = await PrintJobsService.enqueuePreCuenta(branch_id, {
          tableId,
          tableName: session?.restaurant_tables?.name || mesaNombre,
          serverName,
          createdAt: new Date().toISOString(),
          subtotal: cuenta.subtotal,
          taxTotal: cuenta.tax_total,
          discountTotal: cuenta.discount_total,
          total: cuenta.total,
          items: cuenta.items.map((item) => {
            const notesObj = typeof item.notes === 'string' ? (() => { try { return JSON.parse(item.notes || '{}'); } catch { return {}; } })() : (item.notes || {});
            return {
              productName: item.product?.name || 'Producto',
              quantity: item.quantity,
              unitPrice: item.unit_price,
              total: item.total,
              taxAmount: item.tax_amount,
              discountAmount: item.discount_amount,
              variantData: item.product?.variant_data || null,
              modifiers: Array.isArray(notesObj?.modifiers) ? notesObj.modifiers.map((m: any) => ({ name: m.name, extraPrice: m.extraPrice || 0 })) : null,
            };
          }),
          businessName: businessInfo?.name,
          businessNit: businessInfo?.nit,
          businessPhone: businessInfo?.phone,
          businessAddress: businessInfo?.address,
          businessEmail: businessInfo?.email,
          businessCity: businessInfo?.city,
          businessFiscalResponsibilities: businessInfo?.fiscalResponsibilities,
          branchName: branchInfo?.name,
          branchAddress: branchInfo?.address,
          branchPhone: branchInfo?.phone,
        });
        if (enqueued > 0) return;
      } catch (err) {
        console.warn('No se pudo encolar impresión física de pre-cuenta:', err);
      }
    }

    const businessInfo = organization ? {
      name: organization.name || '',
      nit: (organization as any).tax_id || '',
      phone: (organization as any).phone || '',
      address: (organization as any).address || '',
    } : undefined;
    const branchInfo = currentBranch ? {
      name: currentBranch.name || '',
      address: currentBranch.address || '',
      phone: currentBranch.phone || '',
    } : undefined;
    PrintService.printPreCuenta(
      session?.restaurant_tables?.name || mesaNombre,
      cuenta.items,
      cuenta.subtotal,
      cuenta.tax_total,
      cuenta.discount_total,
      cuenta.total,
      businessInfo,
      branchInfo,
      serverName,
      undefined,
    );
  };

  const handleGenerarPreCuenta = async () => {
    if (!session) return;

    if (!session?.sale_items || session.sale_items.length === 0) {
      toast({
        title: 'Sin productos',
        description: 'No hay productos para generar la cuenta',
        variant: 'destructive',
      });
      return;
    }

    try {
      const cuenta = await PedidosService.generarPreCuenta(tableId);
      setPreCuenta(cuenta);
      setShowPreCuenta(true);
      await imprimirPreCuenta(cuenta);
    } catch (error) {
      console.error('Error generando pre-cuenta:', error);
      toast({
        title: 'Error',
        description: 'No se pudo generar la pre-cuenta',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleSolicitarCuenta = async () => {
    if (!session) return;

    if (!session?.sale_items || session.sale_items.length === 0) {
      toast({
        title: 'Sin productos',
        description: 'No hay productos para solicitar la cuenta',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Actualizar estado a bill_requested
      await PedidosService.solicitarCuenta(session.id);
      await cargarDatos();
      
      // Mostrar diálogo de división si hay más de 1 comensal
      if (session.customers > 1) {
        toast({
          title: 'Cuenta solicitada',
          description: '¿Deseas dividir la cuenta entre comensales?',
        });
        // Abrir automáticamente el diálogo de división
        setShowSplitBill(true);
      } else {
        toast({
          title: 'Cuenta solicitada',
          description: 'La mesa ha solicitado la cuenta',
        });
        // Si es solo 1 comensal, ir directo al checkout
        setShowCheckout(true);
      }
    } catch (error) {
      console.error('Error solicitando cuenta:', error);
      toast({
        title: 'Error',
        description: 'No se pudo solicitar la cuenta',
        variant: 'destructive',
      });
    }
  };

  const handleEnviarComanda = async () => {
    if (!session) return;

    try {
      const ticketsEnviados = await PedidosService.enviarComandaCocina(session.id);
      toast({
        title: 'Comanda enviada',
        description: 'La comanda se ha enviado a cocina',
      });

      // Impresión física (best-effort): no bloquea el flujo si falla o si no hay
      // impresoras/agente configurados, ya que la Comanda digital (KDS) ya se envió.
      if (branch_id && ticketsEnviados.length > 0) {
        for (const ticket of ticketsEnviados) {
          await PrintJobsService.enqueueKitchenTicket(branch_id, {
            ticketId: ticket.ticketId,
            tableName: mesaNombre,
            serverName,
            createdAt: ticket.createdAt,
            items: ticket.items,
          });
        }
      }
    } catch (error) {
      console.error('Error enviando comanda:', error);
      toast({
        title: 'Error',
        description: 'No se pudo enviar la comanda',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleTransferItem = async (
    itemId: string,
    toTableId: string,
    quantity: number
  ) => {
    try {
      await PedidosService.transferirItem(itemId, toTableId, quantity);
      await cargarDatos();
      toast({
        title: 'Item transferido',
        description: 'El item se ha transferido exitosamente',
      });
    } catch (error: any) {
      console.error('Error transfiriendo item:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo transferir el item',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const cargarMesasParaCombinar = async () => {
    try {
      const mesas = await MesasService.obtenerMesasConSesiones();
      setTodasLasMesas(mesas);
      setShowCombinar(true);
    } catch (error) {
      console.error('Error cargando mesas:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las mesas',
        variant: 'destructive',
      });
    }
  };

  const handleCombinarMesas = async (
    mesaPrincipalId: string,
    mesasACombinar: string[]
  ) => {
    try {
      await MesasService.combinarMesas(mesaPrincipalId, mesasACombinar);
      toast({
        title: 'Mesas combinadas',
        description: 'Las mesas se han combinado exitosamente',
      });
      
      // Si la mesa actual fue combinada, redirigir a la mesa principal
      if (mesasACombinar.includes(tableId)) {
        router.push(`/app/pos/mesas/${mesaPrincipalId}`);
      } else {
        // Si esta es la mesa principal, recargar datos
        await cargarDatos();
      }
      
      setShowCombinar(false);
    } catch (error: any) {
      console.error('Error combinando mesas:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudieron combinar las mesas',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleAbrirEditarComensales = () => {
    if (session) {
      setComensalesInput(session.customers || 2);
      setShowEditarComensales(true);
    }
  };

  const cargarMiembrosOrganizacion = async () => {
    if (!organization?.id || orgMembers.length > 0) return;
    setLoadingMembers(true);
    try {
      const { supabase } = await import('@/lib/supabase/config');
      const { data, error } = await supabase.rpc('get_profiles_by_organization', { org_id: organization.id });
      if (error) throw error;
      const opciones = (data || [])
        .filter((m: any) => m.is_active !== false)
        .map((m: any) => {
          const userId = m.user_id || m.id;
          const fullName = `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email || 'Sin nombre';
          return { value: userId, label: fullName, sublabel: m.email };
        });
      setOrgMembers(opciones);
    } catch (error) {
      console.error('Error cargando miembros de la organización:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los miembros de la organización',
        variant: 'destructive',
      });
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleAbrirEditarMesero = async () => {
    if (!session) return;
    setMeseroSeleccionado(session.server_id || '');
    setShowEditarMesero(true);
    await cargarMiembrosOrganizacion();
  };

  const handleGuardarMesero = async () => {
    if (!session || !meseroSeleccionado) return;

    try {
      await MesasService.cambiarMesero(session.id, meseroSeleccionado);
      const seleccionado = orgMembers.find((m) => m.value === meseroSeleccionado);
      setServerName(seleccionado?.label);
      setSession({ ...session, server_id: meseroSeleccionado });
      toast({
        title: 'Mesero actualizado',
        description: seleccionado ? `${seleccionado.label} asignado a la mesa` : 'Mesero asignado',
      });
      setShowEditarMesero(false);
    } catch (error: any) {
      console.error('Error cambiando mesero:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo cambiar el mesero',
        variant: 'destructive',
      });
    }
  };

  const handleGuardarComensales = async () => {
    if (!session) return;

    try {
      await PedidosService.actualizarComensales(session.id, comensalesInput);
      await cargarDatos();
      toast({
        title: 'Comensales actualizados',
        description: `Ahora hay ${comensalesInput} comensales en la mesa`,
      });
      setShowEditarComensales(false);
    } catch (error: any) {
      console.error('Error actualizando comensales:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo actualizar la cantidad de comensales',
        variant: 'destructive',
      });
    }
  };

  // Convertir sesión a formato Cart para CheckoutDialog
  const convertSessionToCart = (): Cart => {
    if (!session || !session.sale_id) {
      throw new Error('No hay sesión o venta activa');
    }

    // Solo incluir items NO pagados
    const unpaidItems = (session.sale_items || []).filter(item => !(item as any).paid_at);
    
    const items = unpaidItems.map((item) => {
      // Obtener nombre del producto de múltiples fuentes
      const productData = (item as any).product;
      // notes puede ser string o objeto JSON
      const notesObj = typeof item.notes === 'string' ? JSON.parse(item.notes || '{}') : (item.notes || {});
      const productName = productData?.name || notesObj?.product_name || 'Producto';
      
      return {
        id: item.id,
        cart_id: session.sale_id!,
        product_id: item.product_id || 0,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        total: Number(item.total),
        tax_amount: Number(item.tax_amount || 0),
        tax_rate: 0,
        discount_amount: Number(item.discount_amount || 0),
        created_at: item.created_at,
        updated_at: item.updated_at,
        product: {
          id: item.product_id || productData?.id || 0,
          name: productName,
          sku: productData?.sku || '',
          status: 'active',
          organization_id: session.organization_id,
        } as any,
      };
    });

    // Usar totales calculados por el hook useMesaTaxes (MesaTaxBreakdown) si están disponibles
    // Esto asegura que el CheckoutDialog reciba los mismos totales que muestra el sidebar
    const hookSubtotal = calculatedTaxTotals?.subtotal ?? null;
    const hookTaxTotal = calculatedTaxTotals?.taxTotal ?? null;
    const hookTotal = calculatedTaxTotals?.total ?? null;
    const hookTaxIncluded = calculatedTaxTotals?.taxIncluded ?? false;

    const subtotal = hookSubtotal ?? items.reduce((sum, item) => sum + (Number(item.unit_price) * Number(item.quantity)), 0);
    const taxTotal = hookTaxTotal ?? items.reduce((sum, item) => sum + (item.tax_amount || 0), 0);
    const discountTotal = items.reduce((sum, item) => sum + (item.discount_amount || 0), 0);
    const grandTotal = hookTotal ?? (subtotal + taxTotal - discountTotal);

    // Si el hook calculó impuestos, distribuir proporcionalmente por item para que CheckoutDialog vea tax_amount por item
    if (hookTaxTotal && hookTaxTotal > 0 && items.length > 0) {
      const itemsBaseTotal = items.reduce((sum, item) => sum + (Number(item.unit_price) * Number(item.quantity)), 0);
      if (itemsBaseTotal > 0) {
        items.forEach(item => {
          const itemBase = Number(item.unit_price) * Number(item.quantity);
          item.tax_amount = Math.round((itemBase / itemsBaseTotal) * hookTaxTotal * 100) / 100;
        });
      }
    }

    return {
      id: session.sale_id,
      organization_id: session.organization_id,
      branch_id: branch_id || 0,
      customer_id: selectedCustomer?.id || undefined,
      status: 'active',
      items,
      total: grandTotal,
      subtotal,
      tax_amount: taxTotal,
      tax_total: taxTotal,
      tax_included: hookTaxIncluded,
      discount_amount: discountTotal,
      discount_total: discountTotal,
      created_at: session.opened_at,
      updated_at: session.opened_at,
      customer: selectedCustomer,
    };
  };

  // Callback para procesar pago de mesa: actualiza venta existente en vez de crear nueva
  const handleProcessPayment = async (checkoutData: CheckoutData): Promise<Sale> => {
    if (!session?.sale_id) {
      throw new Error('No hay venta asociada a la sesión');
    }

    const result = await PedidosService.completarVentaMesa(session.sale_id, {
      payments: checkoutData.payments,
      total_paid: checkoutData.total_paid,
      tip_amount: checkoutData.tip_amount,
      tip_server_id: checkoutData.tip_server_id,
      tax_included: checkoutData.tax_included,
      tax_breakdown: checkoutData.tax_breakdown,
      subtotal: checkoutData.cart.subtotal,
      tax_total: checkoutData.cart.tax_total,
      total: checkoutData.cart.total,
      table_session_id: session.id,
    });

    // Retornar como Sale para compatibilidad con CheckoutDialog
    return {
      id: result.id,
      total: result.total,
      status: result.status,
    } as Sale;
  };

  const handleCheckout = () => {
    if (!session?.sale_items || session.sale_items.length === 0) {
      toast({
        title: 'Sin productos',
        description: 'Agrega productos antes de procesar el pago',
        variant: 'destructive',
      });
      return;
    }
    
    // Si hay splits configurados, verificar items sin asignar
    if (billSplits && billSplits.length > 0) {
      // Detectar items sin asignar
      const allCurrentItems = session.sale_items.filter(item => !(item as any).paid_at);
      const itemsInSplits = billSplits.flatMap(split => split.items.map(si => si.item.id));
      const unassignedItems = allCurrentItems.filter(item => !itemsInSplits.includes(item.id));

      if (unassignedItems.length > 0) {
        const unassignedTotal = unassignedItems.reduce((sum, item) => sum + Number(item.total), 0);
        
        toast({
          title: 'Divide la cuenta nuevamente',
          description: `Hay ${unassignedItems.length} producto(s) por ${formatCurrency(unassignedTotal)} sin asignar. Debes dividir de nuevo para incluirlos.`,
          variant: 'destructive',
        });
        return;
      }
      
      setShowSplitSelector(true);
    } else {
      setShowCheckout(true);
    }
  };

  // Convertir un split a formato Cart
  const convertSplitToCart = (split: BillSplit): Cart => {
    if (!session || !session.sale_id) {
      throw new Error('No hay sesión o venta activa');
    }

    // Si es división equitativa (sin items asignados), crear un item virtual
    const items = split.items.length > 0 
      ? split.items.map((splitItem) => ({
          id: splitItem.item.id,
          cart_id: session.sale_id!,
          product_id: splitItem.item.product_id || 0,
          quantity: splitItem.quantity,
          unit_price: Number(splitItem.item.unit_price),
          discount: 0,
          tax: Number(splitItem.item.tax_amount) || 0,
          total: (Number(splitItem.item.unit_price) * splitItem.quantity),
          note: typeof splitItem.item.notes === 'object' ? (splitItem.item.notes as any)?.extra : splitItem.item.notes,
          name: splitItem.item.product?.name || 'Producto',
          sku: splitItem.item.product?.sku || '',
          product: splitItem.item.product || { 
            id: splitItem.item.product_id || 0, 
            name: 'Producto', 
            sku: '' 
          } as any,
          created_at: splitItem.item.created_at,
          updated_at: splitItem.item.updated_at,
        }))
      : [{
          // Item virtual para división equitativa
          id: `split-${split.id}`,
          cart_id: session.sale_id!,
          product_id: 0,
          quantity: 1,
          unit_price: split.total,
          discount: 0,
          tax: 0,
          total: split.total,
          note: `División equitativa - ${split.name}`,
          name: `División equitativa - ${split.name}`,
          sku: 'DIV-EQUAL',
          product: { 
            id: 0, 
            name: `División equitativa - ${split.name}`, 
            sku: 'DIV-EQUAL' 
          } as any,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }];

    return {
      id: session.sale_id,
      organization_id: session.organization_id,
      branch_id: branch_id || 0,
      customer_id: selectedCustomer?.id,
      customer: selectedCustomer,
      items,
      subtotal: split.total,
      tax_amount: 0,
      tax_total: 0,
      discount_amount: 0,
      discount_total: 0,
      total: split.total,
      status: 'active' as const,
      created_at: session.opened_at,
      updated_at: session.opened_at,
    };
  };

  const handleOpenSplitBill = () => {
    if (!session?.sale_items || session.sale_items.length === 0) {
      toast({
        title: 'Sin productos',
        description: 'No hay productos para dividir',
        variant: 'destructive',
      });
      return;
    }
    setShowSplitBill(true);
  };

  const handleConfirmSplit = (splits: BillSplit[]) => {
    // Filtrar splits válidos:
    // - División por items: deben tener items Y total > 0
    // - División equitativa: solo necesitan total > 0 (items puede estar vacío)
    const validSplits = splits.filter(s => s.total > 0);
    
    setBillSplits(validSplits);
    setPaidSplitIds([]); // Reset pagos
    
    if (validSplits.length === 0) {
      toast({
        title: 'No hay items asignados',
        description: 'Asigna productos a los comensales o usa división equitativa',
        variant: 'destructive',
      });
      return;
    }
    
    // Detectar si es división equitativa (todos tienen items vacíos)
    const isEqualSplit = validSplits.every(s => s.items.length === 0);
    
    toast({
      title: 'Cuenta dividida',
      description: isEqualSplit 
        ? `Cuenta dividida equitativamente entre ${validSplits.length} comensal${validSplits.length > 1 ? 'es' : ''}`
        : `La cuenta se dividió entre ${validSplits.length} comensal${validSplits.length > 1 ? 'es' : ''}`,
    });
  };

  const handleCancelSplit = () => {
    setBillSplits(null);
    setCurrentSplitIndex(0);
    setPaidSplitIds([]);
    toast({
      title: 'División cancelada',
      description: 'Se restauró la cuenta completa',
    });
  };

  // Seleccionar un split para pagar
  const handleSelectSplitToPay = (splitId: string) => {
    const split = billSplits?.find(s => s.id === splitId);
    if (!split) return;

    const splitIndex = billSplits?.findIndex(s => s.id === splitId) || 0;
    setCurrentSplitIndex(splitIndex);
    setShowSplitSelector(false);
    setShowCheckout(true);
  };

  // Cerrar mesa con pagos parciales
  const handleFinishWithPartialPayments = async () => {
    try {
      if (!billSplits || paidSplitIds.length === 0) {
        toast({
          title: 'Error',
          description: 'Debe procesar al menos un pago',
          variant: 'destructive',
        });
        return;
      }

      // Detectar items sin asignar (agregados después de dividir)
      const allCurrentItems = session?.sale_items?.filter(item => !(item as any).paid_at) || [];
      const itemsInSplits = billSplits.flatMap(split => split.items.map(si => si.item.id));
      const unassignedItems = allCurrentItems.filter(item => !itemsInSplits.includes(item.id));

      if (unassignedItems.length > 0) {
        const unassignedTotal = unassignedItems.reduce((sum, item) => sum + Number(item.total), 0);
        
        toast({
          title: 'Hay productos sin asignar',
          description: `${unassignedItems.length} producto(s) por ${formatCurrency(unassignedTotal)} fueron agregados después de dividir. Por favor, divide la cuenta nuevamente.`,
          variant: 'destructive',
        });
        
        // Cancelar división para forzar a dividir de nuevo
        setBillSplits(null);
        setPaidSplitIds([]);
        setShowSplitSelector(false);
        return;
      }

      const pendingSplits = billSplits.filter(s => !paidSplitIds.includes(s.id));
      const totalPaid = billSplits
        .filter(s => paidSplitIds.includes(s.id))
        .reduce((sum, s) => sum + s.total, 0);

      if (pendingSplits.length > 0) {
        const confirmed = confirm(
          `Quedan ${pendingSplits.length} pago(s) pendiente(s) por un total de ${formatCurrency(
            pendingSplits.reduce((sum, s) => sum + s.total, 0)
          )}.\n\n¿Deseas cerrar la mesa de todas formas?`
        );

        if (!confirmed) return;
      }

      // Liberar la mesa
      await MesasService.liberarMesa(tableId);

      toast({
        title: 'Mesa liberada',
        description: `Total pagado: ${formatCurrency(totalPaid)}. ${paidSplitIds.length} de ${billSplits.length} pagos procesados.`,
      });

      // Limpiar estados y volver
      setBillSplits(null);
      setPaidSplitIds([]);
      setCurrentSplitIndex(0);
      router.push('/app/pos/mesas');
    } catch (error: any) {
      console.error('Error liberando mesa:', error);
      toast({
        title: 'Error',
        description: error?.message || 'No se pudo liberar la mesa',
        variant: 'destructive',
      });
    }
  };

  const handleCheckoutComplete = async (sale: Sale) => {
    try {
      // Si hay splits, marcar como pagado y volver al selector
      if (billSplits && billSplits.length > 0) {
        const currentSplit = billSplits[currentSplitIndex];
        
        // Marcar items del split como pagados en la base de datos
        if (currentSplit.items.length > 0) {
          const { supabase } = await import('@/lib/supabase/config');
          const itemIds = currentSplit.items.map(si => si.item.id);
          
          await supabase
            .from('sale_items')
            .update({
              paid_at: new Date().toISOString(),
              paid_by_split_id: currentSplit.id
            })
            .in('id', itemIds);
        }
        
        // Marcar split como pagado
        const newPaidIds = [...paidSplitIds, currentSplit.id];
        setPaidSplitIds(newPaidIds);

        toast({
          title: `Pago completado`,
          description: `${currentSplit.name}: ${formatCurrency(currentSplit.total)}`,
        });

        setShowCheckout(false);
        
        // Recargar datos de la mesa para reflejar items pagados
        await cargarDatos();

        // Verificar si todos están pagados
        if (newPaidIds.length === billSplits.length) {
          // Verificar si hay items sin asignar antes de liberar
          const allCurrentItems = session?.sale_items?.filter(item => !(item as any).paid_at) || [];
          const itemsInSplits = billSplits.flatMap(split => split.items.map(si => si.item.id));
          const unassignedItems = allCurrentItems.filter(item => !itemsInSplits.includes(item.id));

          if (unassignedItems.length > 0) {
            const unassignedTotal = unassignedItems.reduce((sum, item) => sum + Number(item.total), 0);
            
            toast({
              title: 'Hay productos sin asignar',
              description: `${unassignedItems.length} producto(s) por ${formatCurrency(unassignedTotal)} fueron agregados después. Divide la cuenta nuevamente para incluirlos.`,
              variant: 'destructive',
            });
            
            // Cancelar división para forzar a dividir de nuevo
            setBillSplits(null);
            setPaidSplitIds([]);
            setShowSplitSelector(false);
            return;
          }

          // Todos los splits pagados y sin items pendientes, liberar mesa
          setTimeout(async () => {
            // MesasService.liberarMesa marca las comandas pendientes como entregadas
            await MesasService.liberarMesa(tableId);
            
            toast({
              title: '¡Todos los pagos completados!',
              description: `${billSplits.length} pagos procesados. Mesa liberada.`,
            });

            // Limpiar splits y volver a mesas
            setBillSplits(null);
            setPaidSplitIds([]);
            setCurrentSplitIndex(0);
            router.push('/app/pos/mesas');
          }, 1500);
        } else {
          // Volver al selector para elegir siguiente pago
          setTimeout(() => {
            setShowSplitSelector(true);
          }, 1000);
        }
      } else {
        // Pago único sin división
        // MesasService.liberarMesa marca las comandas pendientes como entregadas
        await MesasService.liberarMesa(tableId);

        toast({
          title: 'Venta completada',
          description: `Total: ${formatCurrency(sale.total)}. Mesa liberada.`,
        });

        // Volver a mesas
        router.push('/app/pos/mesas');
      }
    } catch (error: any) {
      console.error('Error completando checkout:', error);
      toast({
        title: 'Error al completar pago',
        description: error?.message || 'No se pudo completar el pago',
        variant: 'destructive',
      });
    }
  };

  const handleCustomerSelect = async (customer?: Customer, room?: OccupiedSpace) => {
    try {
      console.log('handleCustomerSelect llamado con:', { customer, room });
      
      // Si se selecciona un cliente y no hay sesión, crearla
      if (customer && !session) {
        await asegurarSesion();
      }
      
      setSelectedCustomer(customer);
      setSelectedRoom(room);
      
      // Si se seleccionó una habitación con reserva, actualizar la venta con reservation_id
      if (room && session) {
        console.log('Actualizando venta con reservation_id:', room.reservation_id);
        const { supabase } = await import('@/lib/supabase/config');
        
        const { error } = await supabase
          .from('sales')
          .update({
            customer_id: customer?.id,
            reservation_id: room.reservation_id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', session.sale_id);
        
        if (error) {
          console.error('Error actualizando venta:', error);
          throw error;
        }
        
        console.log('Venta actualizada exitosamente con customer_id y reservation_id');
        
        // 🔗 INTEGRACIÓN POS → PMS: Si ya hay items, sincronizarlos con el folio
        if (room.folio_id && session?.sale_items && session.sale_items.length > 0) {
          console.log('📦 Sincronizando', session.sale_items.length, 'items existentes con folio...');
          const FoliosService = (await import('@/lib/services/foliosService')).default;
          
          for (const saleItem of session.sale_items) {
            await FoliosService.addFolioItem({
              folio_id: room.folio_id,
              source: 'pos',
              description: saleItem.product?.name || 'Producto',
              amount: Number(saleItem.total),
              created_by: organization?.user?.id,
            });
          }
          
          console.log('✅ Items existentes sincronizados con folio');
        }
        
        // Recargar datos para reflejar los cambios
        await cargarDatos();
      }

      toast({
        title: 'Cliente asignado',
        description: room 
          ? `${customer?.full_name} - ${room.space_label}${room.folio_id && session?.sale_items?.length ? ' (Items sincronizados con folio)' : ''}` 
          : customer?.full_name,
      });
    } catch (error: any) {
      console.error('Error al seleccionar cliente:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Error al asignar cliente',
        variant: 'destructive',
      });
    }
  };

  const getTiempoSesion = () => {
    if (!session?.opened_at) return '';
    
    const inicio = new Date(session.opened_at);
    const ahora = new Date();
    const diff = Math.floor((ahora.getTime() - inicio.getTime()) / 60000);
    
    if (diff < 60) return `${diff} min`;
    const horas = Math.floor(diff / 60);
    const minutos = diff % 60;
    return `${horas}h ${minutos}m`;
  };

  const getEstadoBadge = () => {
    if (!session) return null;
    
    if (session.status === 'bill_requested') {
      return <Badge variant="warning">Cuenta Solicitada</Badge>;
    }
    return <Badge variant="default">Activa</Badge>;
  };

  // Estado para totales calculados por MesaTaxBreakdown (hook useMesaTaxes)
  // Debe ir antes de cualquier return condicional para cumplir Rules of Hooks
  const [calculatedTaxTotals, setCalculatedTaxTotals] = useState<{
    subtotal: number;
    taxTotal: number;
    total: number;
    taxIncluded: boolean;
  } | null>(null);

  const handleTaxTotalsChange = useCallback((totals: { subtotal: number; taxTotal: number; total: number; taxIncluded: boolean }) => {
    setCalculatedTaxTotals(totals);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Skeleton header */}
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-7 w-40 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
            <div className="h-10 w-32 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
          </div>

          {/* Skeleton stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-6 w-16 bg-blue-100 dark:bg-blue-900/30 rounded animate-pulse" />
              </div>
            ))}
          </div>

          {/* Skeleton items */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
            <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
                  <div className="space-y-2">
                    <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </div>
                </div>
                <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Calcular datos de items (manejar caso de mesa vacía)
  const allItems = session?.sale_items || [];
  const items = allItems.filter(item => !(item as any).paid_at);
  const paidItems = allItems.filter(item => (item as any).paid_at);
  
  // Detectar items sin asignar a ningún split (agregados después de dividir)
  const itemsInSplits = billSplits?.flatMap(split => split.items.map(si => si.item.id)) || [];
  const unassignedItems = items.filter(item => !itemsInSplits.includes(item.id));
  
  // Totales base desde items (fallback si el hook no ha calculado aún)
  const fallbackTotal = items.reduce((sum, item) => sum + Number(item.total), 0);
  const fallbackSubtotal = items.reduce((sum, item) => sum + Number(item.unit_price) * Number(item.quantity), 0);
  const fallbackTaxes = fallbackTotal - fallbackSubtotal;
  
  // Usar totales del hook si están disponibles, sino fallback
  const subtotal = calculatedTaxTotals?.subtotal ?? fallbackSubtotal;
  const taxes = calculatedTaxTotals?.taxTotal ?? fallbackTaxes;
  const total = calculatedTaxTotals?.total ?? fallbackTotal;
  
  const totalPaid = paidItems.reduce((sum, item) => sum + Number(item.total), 0);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header Fijo */}
      <MesaDetailHeader
        mesaNombre={mesaNombre}
        session={session}
        onRefresh={cargarDatos}
        onCombinar={cargarMesasParaCombinar}
        onAddProduct={() => setShowAddProduct(true)}
        onVerHistorial={() => setShowHistorial(true)}
        getEstadoBadge={getEstadoBadge}
      />

      <SessionTimelineDialog
        open={showHistorial}
        onOpenChange={setShowHistorial}
        tableId={tableId}
      />

      {/* Main Content - 2 Columnas */}
      <div className="container mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          
          {/* Columna Principal - Pedidos */}
          <div className="lg:col-span-2 space-y-4">
            {/* Stats Cards */}
            <MesaStatsCards
              customers={session?.customers || 0}
              tiempoSesion={getTiempoSesion()}
              itemsCount={items.length}
              total={total}
              serverName={serverName}
              onEditarComensales={handleAbrirEditarComensales}
              onEditarMesero={handleAbrirEditarMesero}
            />

            {/* Lista de Productos */}
            <Card className="overflow-hidden">
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-750 px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  Pedido Actual
                </h2>
                <div className="flex items-center gap-4 text-sm">
                  <p className="text-gray-500 dark:text-gray-400">
                    {items.length} {items.length === 1 ? 'producto' : 'productos'} pendiente{items.length !== 1 && 's'}
                  </p>
                  {paidItems.length > 0 && (
                    <p className="text-green-600 dark:text-green-400 font-medium">
                      • {paidItems.length} pagado{paidItems.length !== 1 && 's'} ({formatCurrency(totalPaid)})
                    </p>
                  )}
                </div>
              </div>

              <div className="p-3 sm:p-4">
                {items.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
                      <ChefHat className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 mb-4 font-medium">
                      No hay productos en el pedido
                    </p>
                    <Button 
                      onClick={() => setShowAddProduct(true)}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Agregar Primer Producto
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      {items.map((item) => (
                        <OrderItemCard
                          key={item.id}
                          item={item}
                          onUpdateQuantity={handleUpdateQuantity}
                          onDelete={handleDeleteItem}
                          onTransfer={(itemId) => {
                            const itemData = items.find((i) => i.id === itemId);
                            if (itemData) setItemToTransfer(itemData);
                          }}
                        />
                      ))}
                    </div>

                    {/* Items Pagados */}
                    {paidItems.length > 0 && (
                      <>
                        <Separator className="my-4" />
                        <div className="space-y-2">
                          <h3 className="text-sm font-semibold text-green-600 dark:text-green-400 flex items-center gap-2">
                            <CheckCircle className="h-4 w-4" />
                            Items Pagados ({paidItems.length})
                          </h3>
                          <div className="space-y-2 opacity-60">
                            {paidItems.map((item) => (
                              <div
                                key={item.id}
                                className="flex justify-between items-center p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg"
                              >
                                <div className="flex-1">
                                  <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                    {item.product?.name || 'Producto'}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {item.quantity} × {formatCurrency(Number(item.unit_price))}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="font-semibold text-green-600 dark:text-green-400">
                                    {formatCurrency(Number(item.total))}
                                  </p>
                                  <p className="text-xs text-green-600 dark:text-green-400">
                                    ✓ Pagado
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </Card>
          </div>

          {/* Sidebar Derecho - Resumen y Acciones */}
          <MesaActionsSidebar
            selectedCustomer={selectedCustomer}
            selectedRoom={selectedRoom}
            onCustomerSelect={handleCustomerSelect}
            subtotal={subtotal}
            taxes={taxes}
            total={total}
            itemsCount={items.length}
            sessionStatus={session?.status}
            customers={session?.customers || 0}
            billSplits={billSplits}
            unassignedItemsCount={unassignedItems.length}
            unassignedItemsTotal={unassignedItems.reduce((sum, item) => sum + Number(item.total), 0)}
            taxItems={items.map(item => ({
              product_id: item.product_id,
              quantity: Number(item.quantity),
              unit_price: Number(item.unit_price),
              total: Number(item.total),
              tax_amount: Number(item.tax_amount || 0),
            }))}
            onTaxTotalsChange={handleTaxTotalsChange}
            onEnviarComanda={handleEnviarComanda}
            onGenerarPreCuenta={handleGenerarPreCuenta}
            onSolicitarCuenta={handleSolicitarCuenta}
            onOpenSplitBill={handleOpenSplitBill}
            onCancelSplit={handleCancelSplit}
            onCheckout={handleCheckout}
          />
        </div>
      </div>

      {/* Modales */}
      <AddProductDialog
        open={showAddProduct}
        onOpenChange={setShowAddProduct}
        onAddProducts={handleAddProducts}
        comensales={session?.customers || 1}
      />

      <PreCuentaDialog
        open={showPreCuenta}
        onOpenChange={setShowPreCuenta}
        preCuenta={preCuenta}
        tableName={session?.restaurant_tables?.name || mesaNombre}
        onPrint={() => preCuenta && imprimirPreCuenta(preCuenta, true)}
        onGenerateBill={handleSolicitarCuenta}
        onSplitBill={() => {
          setShowPreCuenta(false);
          setShowSplitBill(true);
        }}
        customers={session?.customers || 2}
      />

      <TransferItemDialog
        open={!!itemToTransfer}
        onOpenChange={(open) => !open && setItemToTransfer(null)}
        item={itemToTransfer}
        currentTableId={tableId}
        onTransfer={handleTransferItem}
      />

      {/* Checkout Dialog */}
      {showCheckout && session && (
        <CheckoutDialog
          cart={
            billSplits && billSplits.length > 0
              ? convertSplitToCart(billSplits[currentSplitIndex])
              : convertSessionToCart()
          }
          open={showCheckout}
          onOpenChange={setShowCheckout}
          onCheckoutComplete={handleCheckoutComplete}
          onProcessPayment={handleProcessPayment}
          organization={organization ? {
            name: organization.name,
            legal_name: (organization as any).legal_name,
            nit: (organization as any).nit,
            tax_id: (organization as any).tax_id,
            address: (organization as any).address,
            city: (organization as any).city,
            phone: (organization as any).phone,
            email: (organization as any).email
          } : undefined}
          currentUser={(organization as any)?.user ? {
            name: [(organization as any).user.first_name, (organization as any).user.last_name].filter(Boolean).join(' ') || (organization as any).user.email,
            email: (organization as any).user.email
          } : undefined}
          branch={currentBranch ? {
            name: currentBranch.name,
            address: currentBranch.address,
            city: currentBranch.city,
            phone: currentBranch.phone
          } : undefined}
        />
      )}

      {/* Indicador de progreso de splits */}
      {showCheckout && billSplits && billSplits.length > 0 && (
        <div className="fixed top-4 right-4 z-[60] bg-blue-600 text-white px-6 py-3 rounded-lg shadow-lg">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5" />
            <div>
              <p className="font-semibold">{billSplits[currentSplitIndex].name}</p>
              <p className="text-xs opacity-90">
                {paidSplitIds.length} de {billSplits.length} pagados | {formatCurrency(billSplits[currentSplitIndex].total)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Combinar Mesas Dialog */}
      <CombinarMesasDialog
        open={showCombinar}
        onOpenChange={setShowCombinar}
        mesas={todasLasMesas}
        onCombinar={handleCombinarMesas}
      />

      {/* Split Bill Dialog */}
      <SplitBillDialog
        open={showSplitBill}
        onOpenChange={setShowSplitBill}
        items={session?.sale_items || []}
        total={total}
        comensales={session?.customers || 2}
        onConfirmSplit={handleConfirmSplit}
      />

      {/* Split Payment Selector */}
      {billSplits && (
        <SplitPaymentSelector
          open={showSplitSelector}
          onOpenChange={setShowSplitSelector}
          splits={billSplits}
          paidSplits={paidSplitIds}
          onSelectSplit={handleSelectSplitToPay}
          onFinishAndClose={handleFinishWithPartialPayments}
        />
      )}

      {/* Editar Comensales Dialog */}
      <Dialog open={showEditarComensales} onOpenChange={setShowEditarComensales}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Editar Comensales
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="comensales">Cantidad de comensales</Label>
              <Input
                id="comensales"
                type="number"
                min="1"
                max="99"
                value={comensalesInput}
                onChange={(e) => setComensalesInput(parseInt(e.target.value) || 1)}
                className="text-lg font-semibold"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleGuardarComensales();
                  }
                }}
              />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Ingresa la cantidad de personas en la mesa
              </p>
            </div>

            {/* Botones rápidos */}
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((num) => (
                <Button
                  key={num}
                  variant={comensalesInput === num ? "default" : "outline"}
                  size="sm"
                  onClick={() => setComensalesInput(num)}
                  className="font-semibold"
                >
                  {num}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-2">
              {[6, 7, 8, 9, 10].map((num) => (
                <Button
                  key={num}
                  variant={comensalesInput === num ? "default" : "outline"}
                  size="sm"
                  onClick={() => setComensalesInput(num)}
                  className="font-semibold"
                >
                  {num}
                </Button>
              ))}
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowEditarComensales(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleGuardarComensales}
              disabled={comensalesInput < 1}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar Mesero Dialog */}
      <Dialog open={showEditarMesero} onOpenChange={setShowEditarMesero}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCircle className="h-5 w-5 text-purple-600" />
              Asignar Mesero
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2 py-4">
            <Label>Mesero</Label>
            <SearchSelect
              options={orgMembers}
              value={meseroSeleccionado}
              onValueChange={setMeseroSeleccionado}
              placeholder={loadingMembers ? 'Cargando miembros...' : 'Selecciona un mesero'}
              searchPlaceholder="Buscar por nombre o correo..."
              disabled={loadingMembers}
            />
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowEditarMesero(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleGuardarMesero}
              disabled={!meseroSeleccionado}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
