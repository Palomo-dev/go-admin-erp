"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { Button } from "@/components/pos/button";
import { Plus, Filter, Search } from "lucide-react";
import { toast } from "react-hot-toast";
import { supabase, getSession, getUserOrganization } from "@/lib/supabase/config";
import { MesasManager } from "@/components/pos/mesas/mesas-manager";

// Interfaz para mesas según la estructura de restaurant_tables en Supabase
interface Mesa {
  id: number;
  name: string;
  zone: string;
  capacity: number;
  state: 'free' | 'occupied' | 'reserved' | 'bill_requested';
  organization_id: number;
  branch_id: number;
  position_x?: number;
  position_y?: number;
  timeOccupied?: string;
  customers?: number;
  server_name?: string;
}

export default function MesasPage() {
  // Estado para almacenar las mesas
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [branchId, setBranchId] = useState<number | null>(null);
  
  // Cargar datos de usuario y organización al iniciar
  useEffect(() => {
    const loadUserData = async () => {
      try {
        // Obtener sesión del usuario
        const { session, error: sessionError } = await getSession();
        if (sessionError || !session) {
          throw new Error("Error al cargar la sesión del usuario");
        }
        
        // Obtener datos de la organización del usuario
        const userOrgResult = await getUserOrganization(session.user.id);
        if (userOrgResult.error || !userOrgResult.organization) {
          throw new Error("Error al cargar la organización del usuario: " + userOrgResult.error);
        }
        
        const orgId = userOrgResult.organization.id;
        setOrganizationId(orgId);
        
        // Obtener sucursal principal del usuario
        const { data: branchData, error: branchError } = await supabase
          .from("branches")
          .select("id, name")
          .eq("organization_id", orgId)
          .eq("is_main", true)
          .single();
          
        if (branchError || !branchData) {
          throw new Error("Error al cargar la sucursal principal");
        }
        
        setBranchId(branchData.id);
        
        // Una vez que tenemos los datos de organización y sucursal, cargamos las mesas
        loadMesas(orgId, branchData.id);
      } catch (error) {
        console.error("Error al cargar datos del usuario:", error);
        setError("Error al cargar datos del usuario");
        setLoading(false);
      }
    };
    
    loadUserData();
  }, []);
  
  // Función para cargar mesas desde Supabase
  const loadMesas = async (orgId: number, branchId: number) => {
    try {
      setLoading(true);
      setError(null);
      
      // Obtener mesas de la organización y sucursal
      const { data: tablasData, error: tablasError } = await supabase
        .from("restaurant_tables")
        .select("*")
        .eq("organization_id", orgId)
        .eq("branch_id", branchId);
      
      if (tablasError) {
        throw new Error("Error al cargar las mesas");
      }
      
      // Si no hay mesas en la base de datos, mostrar mensaje
      if (!tablasData || tablasData.length === 0) {
        setMesas([]);
        setLoading(false);
        return;
      }
      
      // Obtener sesiones de mesa activas para conocer ocupación y tiempos
      const { data: sesionesData, error: sesionesError } = await supabase
        .from("table_sessions")
        .select(`
          id, restaurant_table_id, opened_at, status, customers,
          server_id, profiles:server_id(first_name, last_name)
        `)
        .eq("organization_id", orgId)
        .is("closed_at", null);
      
      if (sesionesError) {
        console.error("Error al cargar sesiones de mesa:", sesionesError);
      }
      
      // Mapear las mesas con datos de sesiones
      const mesasActualizadas = tablasData.map((tabla) => {
        // Buscar si hay una sesión activa para esta mesa
        const sesionActiva = sesionesData?.find(
          (sesion) => sesion.restaurant_table_id === tabla.id
        );
        
        // Calcular tiempo ocupada si hay una sesión activa
        let timeOccupied;
        if (sesionActiva && sesionActiva.opened_at) {
          const opened = new Date(sesionActiva.opened_at);
          const now = new Date();
          const diffMs = now.getTime() - opened.getTime();
          const diffMin = Math.round(diffMs / 60000);
          
          if (diffMin < 60) {
            timeOccupied = `${diffMin} min`;
          } else {
            const hours = Math.floor(diffMin / 60);
            const mins = diffMin % 60;
            timeOccupied = `${hours}h ${mins}m`;
          }
        }
        
        // Determinar estado de la mesa basado en estado en DB y sesión activa
        let state: Mesa["state"] = tabla.state as Mesa["state"];
        if (sesionActiva) {
          if (sesionActiva.status === "bill_requested") {
            state = "bill_requested";
          } else {
            state = "occupied";
          }
        }
        
        // Construir nombre del mesero si existe
        let serverName;
        if (sesionActiva?.profiles) {
          const profile = sesionActiva.profiles as any;
          if (profile.first_name && profile.last_name) {
            serverName = `${profile.first_name} ${profile.last_name}`;
          }
        }
        
        // Retornar objeto de mesa con datos combinados
        return {
          id: tabla.id,
          name: tabla.name,
          zone: tabla.zone || "",
          capacity: tabla.capacity || 0,
          state: state,
          organization_id: tabla.organization_id,
          branch_id: tabla.branch_id,
          position_x: tabla.position_x,
          position_y: tabla.position_y,
          timeOccupied: timeOccupied,
          customers: sesionActiva?.customers,
          server_name: serverName
        };
      });
      
      setMesas(mesasActualizadas);
    } catch (error) {
      console.error("Error al cargar mesas:", error);
      setError("Error al cargar las mesas");
    } finally {
      setLoading(false);
    }
  };

  // Función para obtener color de estado
  const getBadgeColor = (estado: string) => {
    switch (estado) {
      case 'free': return 'bg-green-100 text-green-800';
      case 'occupied': return 'bg-yellow-100 text-yellow-800';
      case 'reserved': return 'bg-blue-100 text-blue-800';
      case 'bill_requested': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  
  // Función para obtener variant del Badge según estado
  const getBadgeVariant = (estado: string) => {
    switch (estado) {
      case 'free': return 'success';
      case 'occupied': return 'warning';
      case 'reserved': return 'info';
      case 'bill_requested': return 'destructive';
      default: return 'default';
    }
  };

  // Texto para estado
  const getEstadoTexto = (estado: string) => {
    switch (estado) {
      case 'free': return 'Libre';
      case 'occupied': return 'Ocupada';
      case 'reserved': return 'Reservada';
      case 'bill_requested': return 'Cuenta solicitada';
      default: return 'Desconocido';
    }
  };

  // Agrupar mesas por zona
  const mesasPorZona = mesas.reduce((acc: { [key: string]: Mesa[] }, mesa) => {
    if (!acc[mesa.zone]) acc[mesa.zone] = [];
    acc[mesa.zone].push(mesa);
    return acc;
  }, {});

  // Router para navegación
  const router = useRouter();
  
  // Estado para componente de mesas
  const [selectedMesa, setSelectedMesa] = useState<Mesa | null>(null);

  // Función para abrir una nueva sesión de mesa
  const handleOpenSession = async (mesa: Mesa, customerCount: number) => {
    try {
      if (!organizationId) {
        throw new Error("No se pudo obtener la organización");
      }
      
      // Obtener información de la sesión actual
      const { session } = await getSession();
      if (!session?.user?.id) {
        throw new Error("No se pudo obtener la sesión del usuario");
      }

      // Crear nueva sesión de mesa
      const { data, error } = await supabase
        .from("table_sessions")
        .insert({
          organization_id: organizationId,
          restaurant_table_id: mesa.id,
          server_id: session.user.id,
          opened_at: new Date().toISOString(),
          customers: customerCount,
          status: "active",
        })
        .select();

      if (error) throw error;

      // Actualizar el estado de la mesa
      const { error: updateError } = await supabase
        .from("restaurant_tables")
        .update({ state: "occupied" })
        .eq("id", mesa.id);

      if (updateError) throw updateError;

      // Recargar las mesas
      if (organizationId && branchId) {
        loadMesas(organizationId, branchId);
      }

      toast.success("Sesión iniciada correctamente");
    } catch (error: any) {
      console.error("Error al abrir sesión:", error);
      toast.error(`Error: ${error.message || 'No se pudo abrir la sesión'}`);
    }
  };

  // Función para solicitar la cuenta
  const handleRequestBill = async (mesa: Mesa) => {
    try {
      // Buscar la sesión activa de la mesa
      const { data: sessions, error: sessionError } = await supabase
        .from("table_sessions")
        .select("id")
        .eq("restaurant_table_id", mesa.id)
        .eq("organization_id", organizationId)
        .is("closed_at", null)
        .maybeSingle();

      if (sessionError) throw sessionError;
      
      if (!sessions) {
        throw new Error("No se encontró una sesión activa para esta mesa");
      }

      // Actualizar estado de la sesión a "bill_requested"
      const { error: updateSessionError } = await supabase
        .from("table_sessions")
        .update({ status: "bill_requested" })
        .eq("id", sessions.id);

      if (updateSessionError) throw updateSessionError;

      // Actualizar el estado de la mesa
      const { error: updateTableError } = await supabase
        .from("restaurant_tables")
        .update({ state: "bill_requested" })
        .eq("id", mesa.id);

      if (updateTableError) throw updateTableError;

      // Recargar las mesas
      if (organizationId && branchId) {
        loadMesas(organizationId, branchId);
      }

      toast.success("Cuenta solicitada correctamente");
    } catch (error: any) {
      console.error("Error al solicitar cuenta:", error);
      toast.error(`Error: ${error.message || 'No se pudo solicitar la cuenta'}`);
    }
  };

  // Función para cerrar una sesión de mesa
  const handleCloseSession = async (mesa: Mesa) => {
    try {
      // Buscar la sesión activa de la mesa
      const { data: sessions, error: sessionError } = await supabase
        .from("table_sessions")
        .select("id")
        .eq("restaurant_table_id", mesa.id)
        .eq("organization_id", organizationId)
        .is("closed_at", null)
        .maybeSingle();

      if (sessionError) throw sessionError;
      
      if (!sessions) {
        throw new Error("No se encontró una sesión activa para esta mesa");
      }

      // Cerrar la sesión
      const { error: updateSessionError } = await supabase
        .from("table_sessions")
        .update({ 
          closed_at: new Date().toISOString(),
          status: "closed" 
        })
        .eq("id", sessions.id);

      if (updateSessionError) throw updateSessionError;

      // Actualizar el estado de la mesa
      const { error: updateTableError } = await supabase
        .from("restaurant_tables")
        .update({ state: "free" })
        .eq("id", mesa.id);

      if (updateTableError) throw updateTableError;

      // Recargar las mesas
      if (organizationId && branchId) {
        loadMesas(organizationId, branchId);
      }

      toast.success("Sesión cerrada correctamente");
    } catch (error: any) {
      console.error("Error al cerrar sesión:", error);
      toast.error(`Error: ${error.message || 'No se pudo cerrar la sesión'}`);
    }
  };

  // Función para cancelar una reserva
  const handleCancelReservation = async (mesa: Mesa) => {
    try {
      // Actualizar el estado de la mesa a libre
      const { error: updateTableError } = await supabase
        .from("restaurant_tables")
        .update({ state: "free" })
        .eq("id", mesa.id);

      if (updateTableError) throw updateTableError;

      // Recargar las mesas
      if (organizationId && branchId) {
        loadMesas(organizationId, branchId);
      }

      toast.success("Reserva cancelada correctamente");
    } catch (error: any) {
      console.error("Error al cancelar reserva:", error);
      toast.error(`Error: ${error.message || 'No se pudo cancelar la reserva'}`);
    }
  };
  
  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Gestión de Mesas</h1>
        <div className="flex gap-2">
          <Button variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Mesa
          </Button>
        </div>
      </div>
      
      <MesasManager
        mesas={mesas}
        loading={loading}
        error={error}
        organizationId={organizationId}
        branchId={branchId}
        onLoadMesas={loadMesas}
        onOpenSession={handleOpenSession}
        onRequestBill={handleRequestBill}
        onCloseSession={handleCloseSession}
        onCancelReservation={handleCancelReservation}
      />
    </div>
  );
}
