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
        <Table>
          <TableHeader>
            <TableRow className="dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <TableHead className="w-8 sm:w-10 dark:text-gray-300"></TableHead>
              <TableHead className="text-xs sm:text-sm dark:text-gray-300">Método de Pago</TableHead>
              <TableHead className="hidden md:table-cell text-xs sm:text-sm dark:text-gray-300">Código</TableHead>
              <TableHead className="hidden lg:table-cell text-xs sm:text-sm dark:text-gray-300">Recomendación</TableHead>
              <TableHead className="hidden xl:table-cell text-xs sm:text-sm dark:text-gray-300">Requiere Ref.</TableHead>
              <TableHead className="hidden sm:table-cell text-xs sm:text-sm dark:text-gray-300">Integración</TableHead>
              <TableHead className="text-xs sm:text-sm dark:text-gray-300">Estado</TableHead>
              <TableHead className="text-right text-xs sm:text-sm dark:text-gray-300">Acciones</TableHead>
            </TableRow>
          </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow className="dark:border-gray-700">
              <TableCell colSpan={8} className="text-center py-8 text-sm dark:text-gray-400">
                <div className="flex items-center justify-center gap-2">
                  <RefreshCcw className="h-4 w-4 animate-spin" />
                  Cargando métodos de pago...
                </div>
              </TableCell>
            </TableRow>
          ) : combinedMethods.length === 0 ? (
            <TableRow className="dark:border-gray-700">
              <TableCell colSpan={8} className="text-center py-8 text-sm dark:text-gray-400">
                No se encontraron métodos de pago.
              </TableCell>
            </TableRow>
          ) : (
            combinedMethods.map((method) => (
              <TableRow key={method.payment_method_code} className="dark:border-gray-700">
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
                <TableCell className="hidden md:table-cell text-xs sm:text-sm dark:text-gray-300">{method.payment_method_code}</TableCell>
                <TableCell className="hidden lg:table-cell">
                  {isRecommended(method.payment_method_code) ? (
                    <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                      ★ Recomendado {countryCode && `(${countryCode})`}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="hidden xl:table-cell text-xs sm:text-sm dark:text-gray-300">
                  {method.payment_method?.requires_reference ? "Sí" : "No"}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {/* Mostrar configuración específica según el método */}
                  {method.settings?.gateway ? (
                    <Badge variant="outline" className="text-xs dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600">
                      {method.settings.gateway}
                    </Badge>
                  ) : (() => {
                    const code = method.payment_method_code.toLowerCase();
                    
                    // Métodos colombianos específicos
                    if (code === 'nequi') {
                      return <Badge variant="outline" className="text-xs bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800">Bancolombia</Badge>;
                    } else if (code === 'daviplata') {
                      return <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">Davivienda</Badge>;
                    } else if (code === 'pse') {
                      return <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">ACH Colombia</Badge>;
                    } else if (code === 'payu') {
                      return <Badge variant="outline" className="text-xs bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800">PayU Latam</Badge>;
                    } else if (code === 'mp') {
                      return <Badge variant="outline" className="text-xs bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800">Mercado Pago</Badge>;
                    
                    // Métodos mexicanos
                    } else if (code === 'oxxo') {
                      return <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800">OXXO Pay</Badge>;
                    } else if (code === 'spei') {
                      return <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">Banxico SPEI</Badge>;
                    } else if (code === 'conekta') {
                      return <Badge variant="outline" className="text-xs bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800">Conekta</Badge>;
                    
                    // Métodos internacionales
                    } else if (code === 'stripe') {
                      return <Badge variant="outline" className="text-xs bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800">Stripe</Badge>;
                    } else if (code === 'paypal') {
                      return <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">PayPal</Badge>;
                    } else if (['cash', 'card', 'transfer', 'check', 'credit'].includes(code)) {
                      return <Badge variant="secondary" className="text-xs dark:bg-gray-700 dark:text-gray-300">Nativo</Badge>;
                    } else {
                      return <span className="text-xs text-gray-500 dark:text-gray-400">N/A</span>;
                    }
                  })()}
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
            ))
          )}
        </TableBody>
        </Table>
      </div>
    </div>
  );
}
