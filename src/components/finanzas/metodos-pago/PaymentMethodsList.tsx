"use client";

import { SucursalesMetodoBadges } from "./SucursalesMetodoPago";
import React, { useState, useMemo, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabase/config";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { 
  Edit, 
  MoreHorizontal, 
  RefreshCcw, 
  CreditCard, 
  Wallet, 
  Banknote, 
  Building2,
  GripVertical,
  Zap,
  Settings,
  Trash2
} from "lucide-react";
import { ConfirmDialog } from "@/components/kit";
import { useTranslations } from "next-intl";
import { accionQuitarMetodo } from "./metodosPagoLogica";
import Link from "next/link";
import { PaymentMethod, OrganizationPaymentMethod } from "./PaymentMethodsPage";
import { nombreVisibleMetodo, requiereReferenciaMetodo } from "@/lib/finanzas/metodosPagoOrganizacion";

// Componente SortableRow para filas arrastrables
// Métodos que requieren integración con pasarela
const GATEWAY_METHODS = ['payu', 'stripe', 'mp', 'mercadopago', 'wompi', 'conekta', 'paypal'];

interface SortableRowProps {
  method: OrganizationPaymentMethod;
  getPaymentIcon: (code: string) => React.ReactNode;
  isRecommended: (code: string) => boolean;
  countryCode: string | null;
  updatingStatus: string | null;
  updatingWebsite: string | null;
  handleToggleActive: (method: OrganizationPaymentMethod) => void;
  handleToggleWebsite: (method: OrganizationPaymentMethod) => void;
  onEdit: (method: OrganizationPaymentMethod) => void;
  onDelete: (method: OrganizationPaymentMethod) => void;
  isLoading: boolean;
}

function SortableRow({
  method,
  getPaymentIcon,
  isRecommended,
  countryCode,
  updatingStatus,
  updatingWebsite,
  handleToggleActive,
  handleToggleWebsite,
  onEdit,
  onDelete,
  isLoading,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: method.payment_method_code });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Métodos que requieren integración
  const INTEGRATION_METHODS = [
    'wompi', 'payu', 'stripe', 'mp', 'mercadopago', 'paypal', 'conekta',
    'nequi', 'daviplata', 'pse', 'oxxo', 'spei', 'cashapp', 'venmo', 'zelle'
  ];

  const getIntegrationBadge = (code: string, gateway?: string, connectionId?: string | null) => {
    const lowerCode = code.toLowerCase();
    const isIntegrationMethod = INTEGRATION_METHODS.includes(lowerCode) || GATEWAY_METHODS.includes(lowerCode);
    
    // Si tiene gateway configurado o conexión vinculada, mostrar badge conectado
    if (gateway || connectionId) {
      return (
        <Link 
          href="/app/integraciones/conexiones"
          className="inline-flex items-center gap-1 hover:opacity-80 transition-opacity"
        >
          <Badge variant="outline" className="text-xs bg-success-subtle text-success-text border-line-success">
            {gateway || 'Conectado'}
          </Badge>
          <Settings className="h-3 w-3 text-fg-muted" />
        </Link>
      );
    }
    
    // Si es método de integración pero no está conectado → ir a integraciones
    if (isIntegrationMethod) {
      return (
        <Link 
          href="/app/integraciones/conexiones"
          className="inline-flex items-center gap-1 hover:opacity-80 transition-opacity"
        >
          <Badge variant="outline" className="text-xs bg-warning-subtle text-warning-text border-line-warning">
            <Zap className="h-3 w-3 mr-1" />
            Conectar
          </Badge>
        </Link>
      );
    }
    
    // Métodos manuales/nativos
    if (['cash', 'card', 'transfer', 'check', 'credit'].includes(lowerCode)) {
      return <Badge variant="secondary" className="text-xs">Nativo</Badge>;
    }
    return <span className="text-xs text-fg-secondary">—</span>;
  };

  return (
    <TableRow 
      ref={setNodeRef} 
      style={style} 
      className={isDragging ? 'bg-brand-tint' : undefined}
    >
      <TableCell className="w-8 cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4 text-fg-muted hover:text-fg" />
      </TableCell>
      <TableCell>
        {getPaymentIcon(method.payment_method_code)}
      </TableCell>
      <TableCell className="font-medium text-xs sm:text-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1">
          <span>{nombreVisibleMetodo(method.settings, method.payment_method?.name, method.payment_method_code)}</span>
          <SucursalesMetodoBadges organizationId={method.organization_id} branchIds={method.branch_ids} />
          {method.payment_method?.is_system && (
            <Badge variant="secondary" className="text-xs w-fit">Sistema</Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell text-xs sm:text-sm">
        {method.payment_method_code}
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        {method.payment_method?.countries && method.payment_method.countries.length > 0 ? (
          <div className="flex flex-wrap gap-1 max-w-[200px]">
            {method.payment_method.countries.length <= 3 ? (
              method.payment_method.countries.map((c) => (
                <Badge 
                  key={c.country_code} 
                  variant="outline" 
                  className={`text-[10px] px-1.5 py-0 ${
                    c.is_recommended 
                      ? 'bg-success-subtle text-success-text border-line-success' 
                      : ''
                  }`}
                >
                  {c.country_code}
                </Badge>
              ))
            ) : (
              <>
                {method.payment_method.countries.slice(0, 2).map((c) => (
                  <Badge 
                    key={c.country_code} 
                    variant="outline" 
                    className={`text-[10px] px-1.5 py-0 ${
                      c.is_recommended 
                        ? 'bg-success-subtle text-success-text border-line-success' 
                        : ''
                    }`}
                  >
                    {c.country_code}
                  </Badge>
                ))}
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  +{method.payment_method.countries.length - 2}
                </Badge>
              </>
            )}
          </div>
        ) : (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            Global
          </Badge>
        )}
      </TableCell>
      <TableCell className="hidden xl:table-cell">
        {isRecommended(method.payment_method_code) ? (
          <Badge className="bg-brand-tint text-brand-deep border-line-brand">
            ★ Recomendado {countryCode && `(${countryCode})`}
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="hidden 2xl:table-cell text-xs sm:text-sm">
        {requiereReferenciaMetodo(method.settings, method.payment_method?.requires_reference) ? "Sí" : "No"}
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        {getIntegrationBadge(method.payment_method_code, method.settings?.gateway, method.integration_connection_id)}
      </TableCell>
      <TableCell>
        <Switch 
          checked={method.show_on_website ?? false}
          disabled={updatingWebsite === method.payment_method_code || method.id === 0}
          onCheckedChange={() => handleToggleWebsite(method)}
         
        />
      </TableCell>
      <TableCell>
        <Switch 
          checked={method.is_active}
          disabled={updatingStatus === method.payment_method_code || method.id === 0}
          onCheckedChange={() => handleToggleActive(method)}
         
        />
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Abrir menú</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Acciones</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => onEdit(method)}
              disabled={isLoading}
             
            >
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </DropdownMenuItem>
            {!method.payment_method?.is_system && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => onDelete(method)}
                  disabled={isLoading}
                  className="text-danger-text"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Quitar
                </DropdownMenuItem>
              </>
            )}
            {GATEWAY_METHODS.includes(method.payment_method_code.toLowerCase()) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link 
                    href={`/app/integraciones/conexiones/nueva?provider=${method.payment_method_code.toLowerCase()}&return=/app/finanzas/metodos-pago`}
                    className="cursor-pointer"
                  >
                    <Zap className="mr-2 h-4 w-4 text-brand" />
                    Configurar Integración
                  </Link>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

interface PaymentMethodsListProps {
  paymentMethods: PaymentMethod[];
  orgPaymentMethods: OrganizationPaymentMethod[];
  recommendedMethods: Array<{ code?: string; payment_method_code?: string }>; // Métodos recomendados
  countryCode: string | null;
  onEdit: (method: OrganizationPaymentMethod) => void;
  isLoading: boolean;
  onRefresh: () => void;
}

export default function PaymentMethodsList({
  paymentMethods,
  orgPaymentMethods,
  recommendedMethods,
  countryCode,
  onEdit,
  isLoading,
  onRefresh
}: PaymentMethodsListProps) {
  const { toast } = useToast();
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [updatingWebsite, setUpdatingWebsite] = useState<string | null>(null);
  const t = useTranslations("finanzasCobrosR2");
  const [deleteTarget, setDeleteTarget] = useState<OrganizationPaymentMethod | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Pagos registrados con el método (`payments.method` = código): null mientras se cuentan
  // o si no se pudieron contar (entonces se trata como «con pagos»: se desactiva, no se borra).
  const [pagosTarget, setPagosTarget] = useState<number | null>(null);
  const [contandoPagos, setContandoPagos] = useState(false);
  
  // Estado local para actualizaciones optimistas
  const [localOrgMethods, setLocalOrgMethods] = useState<OrganizationPaymentMethod[]>(orgPaymentMethods);
  
  // Sincronizar estado local cuando cambian los props
  useEffect(() => {
    setLocalOrgMethods(orgPaymentMethods);
  }, [orgPaymentMethods]);

  // Sensores para drag & drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Función para cambiar el estado activo de un método de pago (optimista)
  const handleToggleActive = async (orgMethod: OrganizationPaymentMethod) => {
    const newIsActive = !orgMethod.is_active;
    
    // Actualización optimista: cambiar estado local inmediatamente
    setLocalOrgMethods(prev => 
      prev.map(m => m.id === orgMethod.id ? { ...m, is_active: newIsActive } : m)
    );
    
    try {
      setUpdatingStatus(orgMethod.payment_method_code);
      
      const { error } = await supabase
        .from("organization_payment_methods")
        .update({ is_active: newIsActive })
        .eq("id", orgMethod.id);
        
      if (error) throw error;
      
      toast({
        title: "Estado actualizado",
        description: `El método de pago ha sido ${newIsActive ? "activado" : "desactivado"}.`,
      });
    } catch (error: unknown) {
      // Revertir en caso de error
      setLocalOrgMethods(prev => 
        prev.map(m => m.id === orgMethod.id ? { ...m, is_active: !newIsActive } : m)
      );
      console.error("Error al actualizar estado:", error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado del método de pago.",
        variant: "destructive",
      });
    } finally {
      setUpdatingStatus(null);
    }
  };

  // Función para cambiar visibilidad en website (optimista)
  const handleToggleWebsite = async (orgMethod: OrganizationPaymentMethod) => {
    if (orgMethod.id === 0) {
      toast({
        title: "Método no configurado",
        description: "Primero debes configurar este método de pago.",
        variant: "destructive",
      });
      return;
    }
    
    const newShowOnWebsite = !orgMethod.show_on_website;
    
    // Actualización optimista: cambiar estado local inmediatamente
    setLocalOrgMethods(prev => 
      prev.map(m => m.id === orgMethod.id ? { ...m, show_on_website: newShowOnWebsite } : m)
    );
    
    try {
      setUpdatingWebsite(orgMethod.payment_method_code);
      
      const { error } = await supabase
        .from("organization_payment_methods")
        .update({ show_on_website: newShowOnWebsite })
        .eq("id", orgMethod.id);
        
      if (error) throw error;
      
      toast({
        title: "Visibilidad actualizada",
        description: `El método ${newShowOnWebsite ? "será visible" : "no será visible"} en el website.`,
      });
    } catch (error: unknown) {
      // Revertir en caso de error
      setLocalOrgMethods(prev => 
        prev.map(m => m.id === orgMethod.id ? { ...m, show_on_website: !newShowOnWebsite } : m)
      );
      console.error("Error al actualizar visibilidad:", error);
      toast({
        title: "Error",
        description: "No se pudo actualizar la visibilidad.",
        variant: "destructive",
      });
    } finally {
      setUpdatingWebsite(null);
    }
  };

  // Función para manejar el reordenamiento con drag & drop (optimista)
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;
    
    const oldIndex = sortedMethods.findIndex(m => m.payment_method_code === active.id);
    const newIndex = sortedMethods.findIndex(m => m.payment_method_code === over.id);
    
    if (oldIndex === -1 || newIndex === -1) return;
    
    const reorderedMethods = arrayMove(sortedMethods, oldIndex, newIndex);
    
    // Guardar estado anterior para poder revertir
    const previousLocalMethods = [...localOrgMethods];
    
    // Actualización optimista: actualizar estado local inmediatamente con nuevos órdenes
    const updatedLocalMethods = localOrgMethods.map(m => {
      const newOrderIndex = reorderedMethods.findIndex(rm => rm.payment_method_code === m.payment_method_code);
      return newOrderIndex !== -1 ? { ...m, website_display_order: newOrderIndex } : m;
    });
    setLocalOrgMethods(updatedLocalMethods);
    
    // Actualizar el orden en la base de datos en segundo plano
    try {
      const updates = reorderedMethods
        .filter(m => m.id !== 0) // Solo actualizar métodos configurados
        .map((method, index) => ({
          id: method.id,
          website_display_order: index,
        }));
      
      // Actualizar cada método con su nuevo orden
      for (const update of updates) {
        const { error } = await supabase
          .from("organization_payment_methods")
          .update({ website_display_order: update.website_display_order })
          .eq("id", update.id);
        
        if (error) throw error;
      }
      
      toast({
        title: "Orden actualizado",
        description: "El orden de los métodos de pago ha sido guardado.",
      });
    } catch (error: unknown) {
      // Revertir en caso de error
      setLocalOrgMethods(previousLocalMethods);
      console.error("Error al actualizar orden:", error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el orden.",
        variant: "destructive",
      });
    }
  };

  // «Quitar» (Finanzas ronda 2, A12): un método con pagos se desactiva; sin pagos se elimina.
  const abrirQuitar = async (method: OrganizationPaymentMethod) => {
    setDeleteTarget(method);
    setPagosTarget(null);
    setContandoPagos(true);
    try {
      const { count, error } = await supabase
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", method.organization_id)
        .eq("method", method.payment_method_code);
      if (error) throw error;
      setPagosTarget(count ?? 0);
    } catch (error: unknown) {
      console.error("Error al contar los pagos del método:", error);
      setPagosTarget(null);
    } finally {
      setContandoPagos(false);
    }
  };

  const accionQuitar = deleteTarget
    ? accionQuitarMetodo({ esSistema: Boolean(deleteTarget.payment_method?.is_system), pagos: pagosTarget, activo: deleteTarget.is_active })
    : "ninguna";

  const desactivarTarget = async () => {
    if (!deleteTarget) return;
    await handleToggleActive({ ...deleteTarget, is_active: true });
    setDeleteTarget(null);
  };

  // Función para quitar un método de pago de la organización.
  // GO-sec (2026-09-28): solo se borra el VÍNCULO de esta organización. La fila
  // de `payment_methods` es del catálogo global (con ON DELETE CASCADE a los
  // vínculos de otras organizaciones); antes se intentaba borrar aquí también.
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      // 1. Eliminar la vinculación de la organización.
      // `.select()` es obligatorio: un DELETE que RLS bloquea NO devuelve
      // error, solo afecta 0 filas. Sin esta comprobación la fila desaparecía
      // de la pantalla y reaparecía al recargar. Borrar métodos de pago exige
      // el permiso `billing_management` (pantalla de roles y de cargos).
      const { data: borradas, error: orgError } = await supabase
        .from('organization_payment_methods')
        .delete()
        .eq('id', deleteTarget.id)
        .select('id');
      if (orgError) {
        // Trigger propuesto (20261107220000, sin aplicar): la base rechaza borrar un método con pagos.
        if (/metodo_con_pagos/.test(String(orgError.message))) throw new Error(t("metodos.quitar.conPagosError"));
        throw orgError;
      }
      if (!borradas || borradas.length === 0) {
        throw new Error(
          'No se pudo eliminar el método de pago: tu cargo o rol no tiene el permiso de facturación.'
        );
      }

      // Actualizar estado local
      setLocalOrgMethods(prev => prev.filter(m => m.id !== deleteTarget.id));

      toast({
        title: 'Método eliminado',
        description: `El método "${deleteTarget.payment_method?.name}" ha sido eliminado.`,
      });
      setDeleteTarget(null);
    } catch (error: unknown) {
      console.error('Error al eliminar método de pago:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el método de pago: ' + (error instanceof Error ? error.message : String(error)),
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Función para obtener el icono según el tipo de método de pago
  const getPaymentIcon = (code: string) => {
    const lowerCode = code.toLowerCase();
    
    // Métodos específicos por código
    switch (lowerCode) {
      case 'nequi':
        return <div className="h-4 w-4 bg-purple-600 text-white rounded text-xs flex items-center justify-center font-bold">N</div>;
      case 'daviplata':
        return <div className="h-4 w-4 bg-red-500 text-white rounded text-xs flex items-center justify-center font-bold">D</div>;
      case 'pse':
        return <div className="h-4 w-4 bg-blue-600 text-white rounded text-xs flex items-center justify-center font-bold">P</div>;
      case 'payu':
        return <div className="h-4 w-4 bg-green-600 text-white rounded text-xs flex items-center justify-center font-bold">U</div>;
      case 'mp':
        return <div className="h-4 w-4 bg-sky-400 text-white rounded text-xs flex items-center justify-center font-bold">M</div>;
      case 'oxxo':
        return <div className="h-4 w-4 bg-yellow-600 text-white rounded text-xs flex items-center justify-center font-bold">O</div>;
      case 'spei':
        return <div className="h-4 w-4 bg-red-600 text-white rounded text-xs flex items-center justify-center font-bold">S</div>;
      case 'stripe':
        return <div className="h-4 w-4 bg-purple-600 text-white rounded text-xs flex items-center justify-center font-bold">S</div>;
      case 'conekta':
        return <div className="h-4 w-4 bg-indigo-600 text-white rounded text-xs flex items-center justify-center font-bold">C</div>;
      default:
        // Iconos genéricos
        if (lowerCode.includes("card") || lowerCode.includes("tarjeta")) {
          return <CreditCard className="h-4 w-4" />;
        } else if (lowerCode.includes("cash") || lowerCode.includes("efectivo")) {
          return <Banknote className="h-4 w-4" />;
        } else if (lowerCode.includes("transfer") || lowerCode.includes("transferencia")) {
          return <Building2 className="h-4 w-4" />;
        } else {
          return <Wallet className="h-4 w-4" />;
        }
    }
  };

  // Función para verificar si un método es recomendado para el país
  const isRecommended = (methodCode: string) => {
    return recommendedMethods.some(rec => rec.code === methodCode || rec.payment_method_code === methodCode);
  };

  // Solo mostrar los métodos que la organización tiene asignados (no todo el catálogo global)
  const combinedMethods = useMemo(() => {
    return localOrgMethods.map(orgMethod => {
      const globalMethod = paymentMethods.find(pm => pm.code === orgMethod.payment_method_code);
      return {
        ...orgMethod,
        payment_method: globalMethod || orgMethod.payment_method
      };
    });
  }, [paymentMethods, localOrgMethods]);

  // Ordenar por website_display_order (menor número = mayor prioridad)
  const sortedMethods = useMemo(() => {
    return [...combinedMethods].sort((a, b) => {
      const orderA = a.website_display_order ?? 999;
      const orderB = b.website_display_order ?? 999;
      return orderA - orderB;
    });
  }, [combinedMethods]);

  // IDs para el SortableContext
  const sortableIds = useMemo(() => sortedMethods.map(m => m.payment_method_code), [sortedMethods]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-fg-secondary flex items-center gap-1">
          <GripVertical className="h-3 w-3" />
          Arrastra para reordenar la prioridad en el website
        </p>
        <Button 
          variant="outline" 
          onClick={onRefresh} 
          disabled={isLoading}
          className="h-9 text-xs sm:text-sm"
        >
          <RefreshCcw className={`h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Actualizar</span>
        </Button>
      </div>
      
      <div className="border rounded-md overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <Table>
            <TableHeader>
              <TableRow className="bg-subtle">
                <TableHead className="w-8"></TableHead>
                <TableHead className="w-8 sm:w-10"></TableHead>
                <TableHead className="text-xs sm:text-sm">Método de Pago</TableHead>
                <TableHead className="hidden md:table-cell text-xs sm:text-sm">Código</TableHead>
                <TableHead className="hidden lg:table-cell text-xs sm:text-sm">Países</TableHead>
                <TableHead className="hidden xl:table-cell text-xs sm:text-sm">Recomendación</TableHead>
                <TableHead className="hidden 2xl:table-cell text-xs sm:text-sm">Requiere Ref.</TableHead>
                <TableHead className="hidden sm:table-cell text-xs sm:text-sm">Integración</TableHead>
                <TableHead className="text-xs sm:text-sm">Website</TableHead>
                <TableHead className="text-xs sm:text-sm">Estado</TableHead>
                <TableHead className="text-right text-xs sm:text-sm">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-sm">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCcw className="h-4 w-4 animate-spin" />
                        Cargando métodos de pago...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : sortedMethods.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-sm">
                      No se encontraron métodos de pago.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedMethods.map((method) => (
                    <SortableRow 
                      key={method.payment_method_code} 
                      method={method}
                      getPaymentIcon={getPaymentIcon}
                      isRecommended={isRecommended}
                      countryCode={countryCode}
                      updatingStatus={updatingStatus}
                      updatingWebsite={updatingWebsite}
                      handleToggleActive={handleToggleActive}
                      handleToggleWebsite={handleToggleWebsite}
                      onEdit={onEdit}
                      onDelete={(m) => void abrirQuitar(m)}
                      isLoading={isLoading}
                    />
                  ))
                )}
              </TableBody>
            </SortableContext>
          </Table>
        </DndContext>
      </div>

      <ConfirmDialog
        abierto={!!deleteTarget}
        onAbiertoChange={(open) => !open && !isDeleting && setDeleteTarget(null)}
        titulo={
          contandoPagos
            ? t("metodos.quitar.titulo")
            : accionQuitar === "eliminar"
              ? t("metodos.quitar.tituloEliminar")
              : accionQuitar === "desactivar"
                ? t("metodos.quitar.tituloDesactivar")
                : t("metodos.quitar.titulo")
        }
        descripcion={
          contandoPagos
            ? t("metodos.quitar.contando")
            : accionQuitar === "eliminar"
              ? t("metodos.quitar.descripcionEliminar", { nombre: deleteTarget ? nombreVisibleMetodo(deleteTarget.settings, deleteTarget.payment_method?.name, deleteTarget.payment_method_code) : "" })
              : accionQuitar === "desactivar"
                ? pagosTarget === null
                  ? t("metodos.quitar.descripcionDesactivarSinConteo", { nombre: deleteTarget ? nombreVisibleMetodo(deleteTarget.settings, deleteTarget.payment_method?.name, deleteTarget.payment_method_code) : "" })
                  : t("metodos.quitar.descripcionDesactivar", { nombre: deleteTarget ? nombreVisibleMetodo(deleteTarget.settings, deleteTarget.payment_method?.name, deleteTarget.payment_method_code) : "", n: pagosTarget })
                : t("metodos.quitar.descripcionNinguna", { nombre: deleteTarget ? nombreVisibleMetodo(deleteTarget.settings, deleteTarget.payment_method?.name, deleteTarget.payment_method_code) : "" })
        }
        textoConfirmar={
          accionQuitar === "eliminar" ? t("metodos.quitar.eliminar") : accionQuitar === "desactivar" ? t("metodos.quitar.desactivar") : t("metodos.quitar.entendido")
        }
        tono={accionQuitar === "eliminar" ? "peligro" : "advertencia"}
        icono={Trash2}
        cargando={isDeleting || contandoPagos}
        onConfirmar={() =>
          accionQuitar === "eliminar" ? handleDelete() : accionQuitar === "desactivar" ? desactivarTarget() : setDeleteTarget(null)
        }
      />
    </div>
  );
}
