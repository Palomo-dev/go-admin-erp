"use client";

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
  GripVertical 
} from "lucide-react";
import { PaymentMethod, OrganizationPaymentMethod } from "./PaymentMethodsPage";

// Componente SortableRow para filas arrastrables
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

  const getIntegrationBadge = (code: string, gateway?: string) => {
    if (gateway) {
      return (
        <Badge variant="outline" className="text-xs dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600">
          {gateway}
        </Badge>
      );
    }
    
    const lowerCode = code.toLowerCase();
    
    if (lowerCode === 'nequi') {
      return <Badge variant="outline" className="text-xs bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800">Bancolombia</Badge>;
    } else if (lowerCode === 'daviplata') {
      return <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">Davivienda</Badge>;
    } else if (lowerCode === 'pse') {
      return <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">ACH Colombia</Badge>;
    } else if (lowerCode === 'payu') {
      return <Badge variant="outline" className="text-xs bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800">PayU Latam</Badge>;
    } else if (lowerCode === 'mp') {
      return <Badge variant="outline" className="text-xs bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800">Mercado Pago</Badge>;
    } else if (lowerCode === 'oxxo') {
      return <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800">OXXO Pay</Badge>;
    } else if (lowerCode === 'spei') {
      return <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">Banxico SPEI</Badge>;
    } else if (lowerCode === 'conekta') {
      return <Badge variant="outline" className="text-xs bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800">Conekta</Badge>;
    } else if (lowerCode === 'stripe') {
      return <Badge variant="outline" className="text-xs bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800">Stripe</Badge>;
    } else if (lowerCode === 'paypal') {
      return <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">PayPal</Badge>;
    } else if (['cash', 'card', 'transfer', 'check', 'credit'].includes(lowerCode)) {
      return <Badge variant="secondary" className="text-xs dark:bg-gray-700 dark:text-gray-300">Nativo</Badge>;
    }
    return <span className="text-xs text-gray-500 dark:text-gray-400">N/A</span>;
  };

  return (
    <TableRow 
      ref={setNodeRef} 
      style={style} 
      className={`dark:border-gray-700 ${isDragging ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
    >
      <TableCell className="w-8 cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
      </TableCell>
      <TableCell className="dark:text-gray-300">
        {getPaymentIcon(method.payment_method_code)}
      </TableCell>
      <TableCell className="font-medium text-xs sm:text-sm dark:text-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1">
          <span>{method.payment_method?.name}</span>
          {method.payment_method?.is_system && (
            <Badge variant="secondary" className="text-xs w-fit dark:bg-gray-700 dark:text-gray-300">Sistema</Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell text-xs sm:text-sm dark:text-gray-300">
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
                      ? 'bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700' 
                      : 'dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'
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
                        ? 'bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700' 
                        : 'dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {c.country_code}
                  </Badge>
                ))}
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 dark:bg-gray-600">
                  +{method.payment_method.countries.length - 2}
                </Badge>
              </>
            )}
          </div>
        ) : (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 dark:bg-gray-600">
            Global
          </Badge>
        )}
      </TableCell>
      <TableCell className="hidden xl:table-cell">
        {isRecommended(method.payment_method_code) ? (
          <Badge className="bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700">
            ★ Recomendado {countryCode && `(${countryCode})`}
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="hidden 2xl:table-cell text-xs sm:text-sm dark:text-gray-300">
        {method.payment_method?.requires_reference ? "Sí" : "No"}
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        {getIntegrationBadge(method.payment_method_code, method.settings?.gateway)}
      </TableCell>
      <TableCell>
        <Switch 
          checked={method.show_on_website ?? false}
          disabled={updatingWebsite === method.payment_method_code || method.id === 0}
          onCheckedChange={() => handleToggleWebsite(method)}
          className="data-[state=checked]:bg-green-600"
        />
      </TableCell>
      <TableCell>
        <Switch 
          checked={method.is_active}
          disabled={updatingStatus === method.payment_method_code || method.id === 0}
          onCheckedChange={() => handleToggleActive(method)}
          className="data-[state=checked]:bg-blue-600"
        />
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0 dark:hover:bg-gray-700">
              <span className="sr-only">Abrir menú</span>
              <MoreHorizontal className="h-4 w-4 dark:text-gray-300" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
            <DropdownMenuLabel className="dark:text-gray-200">Acciones</DropdownMenuLabel>
            <DropdownMenuSeparator className="dark:bg-gray-700" />
            <DropdownMenuItem 
              onClick={() => onEdit(method)}
              disabled={isLoading}
              className="dark:text-gray-300 dark:focus:bg-gray-700 dark:focus:text-gray-100"
            >
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

interface PaymentMethodsListProps {
  paymentMethods: PaymentMethod[];
  orgPaymentMethods: OrganizationPaymentMethod[];
  recommendedMethods: any[]; // Agregar métodos recomendados
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
    } catch (error: any) {
      // Revertir en caso de error
      setLocalOrgMethods(prev => 
        prev.map(m => m.id === orgMethod.id ? { ...m, is_active: !newIsActive } : m)
      );
      console.error("Error al actualizar estado:", error.message);
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
    } catch (error: any) {
      // Revertir en caso de error
      setLocalOrgMethods(prev => 
        prev.map(m => m.id === orgMethod.id ? { ...m, show_on_website: !newShowOnWebsite } : m)
      );
      console.error("Error al actualizar visibilidad:", error.message);
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
    } catch (error: any) {
      // Revertir en caso de error
      setLocalOrgMethods(previousLocalMethods);
      console.error("Error al actualizar orden:", error.message);
      toast({
        title: "Error",
        description: "No se pudo actualizar el orden.",
        variant: "destructive",
      });
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

  // Combinamos los métodos de pago globales con los de la organización (usando estado local para optimismo)
  const combinedMethods = useMemo(() => {
    return paymentMethods.map(method => {
      const orgMethod = localOrgMethods.find(om => om.payment_method_code === method.code);
      
      if (orgMethod) {
        return {
          ...orgMethod,
          payment_method: method
        };
      } else {
        // Si la organización no tiene configurado este método, creamos una versión predeterminada
        return {
          id: 0,
          organization_id: 0,
          payment_method_code: method.code,
          is_active: false,
          settings: {},
          show_on_website: false,
          website_display_order: 999,
          payment_method: method
        } as OrganizationPaymentMethod;
      }
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
        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
          <GripVertical className="h-3 w-3" />
          Arrastra para reordenar la prioridad en el website
        </p>
        <Button 
          variant="outline" 
          onClick={onRefresh} 
          disabled={isLoading}
          className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 h-9 text-xs sm:text-sm"
        >
          <RefreshCcw className={`h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Actualizar</span>
        </Button>
      </div>
      
      <div className="border rounded-md dark:border-gray-700 overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <Table>
            <TableHeader>
              <TableRow className="dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <TableHead className="w-8 dark:text-gray-300"></TableHead>
                <TableHead className="w-8 sm:w-10 dark:text-gray-300"></TableHead>
                <TableHead className="text-xs sm:text-sm dark:text-gray-300">Método de Pago</TableHead>
                <TableHead className="hidden md:table-cell text-xs sm:text-sm dark:text-gray-300">Código</TableHead>
                <TableHead className="hidden lg:table-cell text-xs sm:text-sm dark:text-gray-300">Países</TableHead>
                <TableHead className="hidden xl:table-cell text-xs sm:text-sm dark:text-gray-300">Recomendación</TableHead>
                <TableHead className="hidden 2xl:table-cell text-xs sm:text-sm dark:text-gray-300">Requiere Ref.</TableHead>
                <TableHead className="hidden sm:table-cell text-xs sm:text-sm dark:text-gray-300">Integración</TableHead>
                <TableHead className="text-xs sm:text-sm dark:text-gray-300">Website</TableHead>
                <TableHead className="text-xs sm:text-sm dark:text-gray-300">Estado</TableHead>
                <TableHead className="text-right text-xs sm:text-sm dark:text-gray-300">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <TableBody>
                {isLoading ? (
                  <TableRow className="dark:border-gray-700">
                    <TableCell colSpan={11} className="text-center py-8 text-sm dark:text-gray-400">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCcw className="h-4 w-4 animate-spin" />
                        Cargando métodos de pago...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : sortedMethods.length === 0 ? (
                  <TableRow className="dark:border-gray-700">
                    <TableCell colSpan={11} className="text-center py-8 text-sm dark:text-gray-400">
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
                      isLoading={isLoading}
                    />
                  ))
                )}
              </TableBody>
            </SortableContext>
          </Table>
        </DndContext>
      </div>
    </div>
  );
}
