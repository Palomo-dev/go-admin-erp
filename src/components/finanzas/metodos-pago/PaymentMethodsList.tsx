"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabase/config";
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
  Building2 
} from "lucide-react";
import { PaymentMethod, OrganizationPaymentMethod } from "./PaymentMethodsPage";

interface PaymentMethodsListProps {
  paymentMethods: PaymentMethod[];
  orgPaymentMethods: OrganizationPaymentMethod[];
  onEdit: (method: OrganizationPaymentMethod) => void;
  isLoading: boolean;
  onRefresh: () => void;
}

export default function PaymentMethodsList({
  paymentMethods,
  orgPaymentMethods,
  onEdit,
  isLoading,
  onRefresh
}: PaymentMethodsListProps) {
  const { toast } = useToast();
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  // Función para cambiar el estado activo de un método de pago
  const handleToggleActive = async (orgMethod: OrganizationPaymentMethod) => {
    try {
      setUpdatingStatus(orgMethod.payment_method_code);
      
      const newIsActive = !orgMethod.is_active;
      
      const { error } = await supabase
        .from("organization_payment_methods")
        .update({ is_active: newIsActive })
        .eq("id", orgMethod.id);
        
      if (error) throw error;
      
      toast({
        title: "Estado actualizado",
        description: `El método de pago ha sido ${newIsActive ? "activado" : "desactivado"}.`,
      });
      
      onRefresh();
    } catch (error: any) {
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

  // Función para obtener el icono según el tipo de método de pago
  const getPaymentIcon = (code: string) => {
    const lowerCode = code.toLowerCase();
    if (lowerCode.includes("card") || lowerCode.includes("tarjeta")) {
      return <CreditCard className="h-4 w-4" />;
    } else if (lowerCode.includes("cash") || lowerCode.includes("efectivo")) {
      return <Banknote className="h-4 w-4" />;
    } else if (lowerCode.includes("transfer") || lowerCode.includes("transferencia")) {
      return <Building2 className="h-4 w-4" />;
    } else {
      return <Wallet className="h-4 w-4" />;
    }
  };

  // Combinamos los métodos de pago globales con los de la organización
  const combinedMethods = paymentMethods.map(method => {
    const orgMethod = orgPaymentMethods.find(om => om.payment_method_code === method.code);
    
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
        payment_method: method
      } as OrganizationPaymentMethod;
    }
  });

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button variant="outline" onClick={onRefresh} disabled={isLoading}>
          <RefreshCcw className="h-4 w-4 mr-2" />
          Actualizar
        </Button>
      </div>
      
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead>Método de Pago</TableHead>
            <TableHead>Código</TableHead>
            <TableHead>Requiere Referencia</TableHead>
            <TableHead>Integración</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8">
                Cargando métodos de pago...
              </TableCell>
            </TableRow>
          ) : combinedMethods.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8">
                No se encontraron métodos de pago.
              </TableCell>
            </TableRow>
          ) : (
            combinedMethods.map((method) => (
              <TableRow key={method.payment_method_code}>
                <TableCell>
                  {getPaymentIcon(method.payment_method_code)}
                </TableCell>
                <TableCell className="font-medium">
                  {method.payment_method?.name}
                  {method.payment_method?.is_system && (
                    <Badge variant="secondary" className="ml-2">Sistema</Badge>
                  )}
                </TableCell>
                <TableCell>{method.payment_method_code}</TableCell>
                <TableCell>
                  {method.payment_method?.requires_reference ? "Sí" : "No"}
                </TableCell>
                <TableCell>
                  {method.settings?.gateway ? (
                    <Badge variant="outline">
                      {method.settings.gateway}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">N/A</span>
                  )}
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
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
