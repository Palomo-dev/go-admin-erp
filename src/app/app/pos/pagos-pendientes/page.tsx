"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/pos/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { Input } from "@/components/pos/input";
import Link from "next/link";
import { supabase, getUserOrganization } from "@/lib/supabase/config";
import { Loader2 } from "lucide-react";

// Interfaces
interface PendingPayment {
  id: string;
  date: string;
  customer: {
    id: string;
    name: string;
    phone?: string;
  };
  total: number;
  paid: number;
  balance: number;
  dueDate: string;
  status: "pendiente" | "vencido" | "parcial";
  reference?: string;
  sale_id?: number;
}

interface Organization {
  id: string;
  name: string;
  primary_branch_id: string;
}

type UserData = {
  organization: Organization | null;
  role: string | null;
};

export default function PagosPendientesPage() {
  // Estado para filtros y carga
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("todos");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData>({ organization: null, role: null });
  
  // Estado para pagos pendientes
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);

  // Obtener datos de usuario y pagos pendientes
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw new Error(`Error obteniendo sesión: ${sessionError.message}`);
        }
        
        if (!session?.user?.id) {
          throw new Error("Usuario no autenticado");
        }
        
        // Obtener organización y rol del usuario
        const userOrgData = await getUserOrganization(session.user.id);
        if (!userOrgData?.organization) {
          throw new Error("No se pudo obtener la organización del usuario");
        }
        
        setUserData(userOrgData);
        
        // Una vez que tenemos los datos del usuario, obtenemos los pagos pendientes
        await fetchPendingPayments(userOrgData.organization.id);
        
      } catch (err: any) {
        console.error("Error cargando datos iniciales:", err);
        setError(err.message || "Error obteniendo datos de usuario");
        setLoading(false);
      }
    };
    
    fetchUserData();
  }, []);
  
  // Función para obtener pagos pendientes de Supabase
  const fetchPendingPayments = async (organizationId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      // Consultar cuentas por cobrar
      const { data: accountsReceivableData, error: accountsError } = await supabase
        .from('accounts_receivable')
        .select(`
          id, 
          amount,
          balance,
          due_date,
          status,
          notes,
          created_at,
          days_overdue,
          sale_id,
          customer_id,
          customers:customer_id (id, full_name, phone, email),
          sales:sale_id (id, reference_number)
        `)
        .eq('organization_id', organizationId)
        .not('balance', 'eq', 0); // Solo pagos pendientes con saldo
      
      if (accountsError) {
        throw new Error(`Error cargando cuentas por cobrar: ${accountsError.message}`);
      }
      
      if (accountsReceivableData) {
        // Transformar datos de Supabase al formato de la interfaz
        const transformedData: PendingPayment[] = accountsReceivableData.map(item => {
          // Determinar estado basado en days_overdue y balance vs amount
          let statusValue: "pendiente" | "vencido" | "parcial" = "pendiente";
          
          if (item.days_overdue > 0) {
            statusValue = "vencido";
          } else if (item.balance < item.amount) {
            statusValue = "parcial";
          }
          
          // Extraer referencia de ventas o generar una referencia genérica
          let reference = item.sales?.reference_number || `V-${item.sale_id || 'S/N'}`;
          
          // Intentar extraer información adicional de las notas si existen
          try {
            if (item.notes) {
              const parsedNotes = JSON.parse(item.notes);
              if (parsedNotes.reference) {
                reference = parsedNotes.reference;
              }
            }
          } catch (e) {
            // Si hay error al parsear, mantenemos la referencia original
          }
          
          return {
            id: item.id,
            date: item.created_at,
            customer: {
              id: item.customers?.id || "",
              name: item.customers?.full_name || "Cliente Desconocido",
              phone: item.customers?.phone
            },
            total: parseFloat(item.amount) || 0,
            paid: parseFloat(item.amount) - parseFloat(item.balance) || 0,
            balance: parseFloat(item.balance) || 0,
            dueDate: item.due_date,
            status: statusValue,
            reference: reference,
            sale_id: item.sale_id
          };
        });
        
        setPendingPayments(transformedData);
      } else {
        // Si no hay datos, establecer array vacío
        setPendingPayments([]);
      }
      
    } catch (err: any) {
      console.error("Error cargando pagos pendientes:", err);
      setError(err.message || "Error cargando pagos pendientes");
    } finally {
      setLoading(false);
    }
  };

  // Filtrar pagos pendientes según búsqueda y filtro
  const filteredPayments = pendingPayments.filter(payment => {
    // Filtro por texto
    const matchesSearch = search === "" || 
      payment.customer.name.toLowerCase().includes(search.toLowerCase()) ||
      (payment.reference ? payment.reference.toLowerCase().includes(search.toLowerCase()) : false) ||
      payment.id.toString().toLowerCase().includes(search.toLowerCase());
    
    // Filtro por estado
    const matchesFilter = 
      filter === "todos" || 
      (filter === "vencidos" && payment.status === "vencido") ||
      (filter === "pendientes" && payment.status === "pendiente") ||
      (filter === "parciales" && payment.status === "parcial");
    
    return matchesSearch && matchesFilter;
  });

  // Función para formatear moneda
  const formatCurrency = (amount: number) => {
    return amount.toFixed(2);
  };

  // Función para formatear fecha en formato regional
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short", 
      year: "numeric"
    });
  };

  // Función para obtener color según estado
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "pendiente":
        return "warning";
      case "vencido":
        return "destructive";
      case "parcial":
        return "info";
      default:
        return "secondary";
    }
  };

  // Función para mostrar texto de estado
  const getStatusText = (status: string) => {
    switch (status) {
      case "pendiente":
        return "Pendiente";
      case "vencido":
        return "Vencido";
      case "parcial":
        return "Pago Parcial";
      default:
        return status;
    }
  };

  // Calcular totales
  const totalPending = filteredPayments.reduce((sum, payment) => sum + payment.balance, 0);
  const countOverdue = filteredPayments.filter(p => p.status === "vencido").length;

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Pagos Pendientes</h1>
          {!loading && !error && (
            <p className="text-gray-600">
              {filteredPayments.length} pagos pendientes por un total de ${formatCurrency(totalPending)}
            </p>
          )}
        </div>
        <div>
          <Link href="/app/pos">
            <Button variant="outline" className="mr-2">
              Volver a POS
            </Button>
          </Link>
          <Button>
            Enviar Recordatorios
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Buscar por Cliente o Referencia
              </label>
              <Input
                type="text"
                placeholder="Nombre de cliente o referencia..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Filtrar por Estado
              </label>
              <select
                className="w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors h-9"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="todos">Todos los estados</option>
                <option value="pendiente">Pendientes</option>
                <option value="vencido">Vencidos</option>
                <option value="parcial">Pago Parcial</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Resumen
              </label>
              <div className="flex gap-2">
                <Badge className="border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-700 dark:text-yellow-100">Pendientes: {filteredPayments.filter(p => p.status === "pendiente").length}</Badge>
                <Badge className="border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80">Vencidos: {countOverdue}</Badge>
                <Badge className="border-transparent bg-blue-100 text-blue-800 dark:bg-blue-700 dark:text-blue-100">Parciales: {filteredPayments.filter(p => p.status === "parcial").length}</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estados de carga y error */}
      {loading && (
        <Card>
          <CardContent className="p-8 text-center flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            <p className="text-gray-500">Cargando pagos pendientes...</p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-8 text-center">
            <p className="text-red-500">{error}</p>
            <Button className="mt-4" onClick={() => userData.organization?.id && fetchPendingPayments(userData.organization.id)}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Listado de pagos pendientes */}
      {!loading && !error && (
        <div className="space-y-4">
          {filteredPayments.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-500">No hay pagos pendientes con los filtros seleccionados</p>
              </CardContent>
            </Card>
          ) : (
          filteredPayments.map((payment) => (
            <Card key={payment.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <div className="grid md:grid-cols-6 gap-4 p-4">
                <div className="md:col-span-2">
                  <div className="font-medium">{payment.customer.name}</div>
                  {payment.customer.phone && (
                    <div className="text-sm text-gray-500">{payment.customer.phone}</div>
                  )}
                  <div className="text-sm mt-1">
                    Fecha: {formatDate(payment.date)}
                  </div>
                  {payment.reference && (
                    <div className="text-sm">Ref: {payment.reference}</div>
                  )}
                </div>
                
                <div className="md:col-span-2">
                  <div className="flex items-center gap-2">
                    <Badge className={`${payment.status === 'pendiente' ? 'border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-700 dark:text-yellow-100' : payment.status === 'vencido' ? 'border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80' : 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-700 dark:text-blue-100'}`}>
                      {getStatusText(payment.status)}
                    </Badge>
                  </div>
                  <div className="text-sm mt-1">
                    Vencimiento: {formatDate(payment.dueDate)}
                  </div>
                  {payment.status === "vencido" && (
                    <div className="text-xs text-red-500 mt-1">
                      ¡Atención requerida!
                    </div>
                  )}
                </div>
                
                <div className="md:col-span-1">
                  <div className="text-sm">Total: <span className="font-medium">${formatCurrency(payment.total)}</span></div>
                  <div className="text-sm">Pagado: <span className="font-medium">${formatCurrency(payment.paid)}</span></div>
                  <div className="font-medium text-red-600 mt-1">
                    Pendiente: ${formatCurrency(payment.balance)}
                  </div>
                </div>
                
                <div className="md:col-span-1 flex flex-col justify-center">
                  <Link href={`/app/pos/cobro?pending=${payment.id}`}>
                    <Button className="w-full mb-2">
                      Cobrar
                    </Button>
                  </Link>
                  <Button className="bg-primary text-primary-foreground shadow hover:bg-primary/90 w-full mb-2">
                    Detalles
                  </Button>
                </div>
              </div>
            </Card>
          ))
          )}
        </div>
      )}

      {/* Paginación */}
      {filteredPayments.length > 0 && (
        <div className="mt-6 flex justify-center">
          <div className="flex gap-1">
            <Button className="border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 rounded-md px-3 text-xs" disabled={true}>
              Anterior
            </Button>
            <Button className="bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 h-8 rounded-md px-3 text-xs">1</Button>
            <Button className="bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 h-8 rounded-md px-3 text-xs">2</Button>
            <Button className="bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 h-8 rounded-md px-3 text-xs">3</Button>
            <Button className="bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 h-8 rounded-md px-3 text-xs">
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
