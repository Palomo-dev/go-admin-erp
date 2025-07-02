"use client";

import { useEffect, useState } from "react";
import { Loader2, UserCircle, Users, TrendingUp, Phone } from "lucide-react";
import { supabase } from "@/lib/supabase/config";
import { cn } from "@/utils/Utils";
import { useTheme } from "next-themes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface CustomerStats {
  total: number;
  activeOpportunities: number;
  contactedThisMonth: number;
}

export function CustomerSummary() {
  const [stats, setStats] = useState<CustomerStats>({
    total: 0,
    activeOpportunities: 0,
    contactedThisMonth: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const { theme } = useTheme();

  const getOrganizationId = () => {
    if (typeof window !== "undefined") {
      const orgData = localStorage.getItem("organizacionActiva");
      if (orgData) {
        try {
          const parsed = JSON.parse(orgData);
          return parsed?.id || null;
        } catch (err) {
          console.error(
            "Error parsing organization data from localStorage",
            err
          );
          return null;
        }
      }
    }
    return null;
  };

  const fetchStats = async () => {
    setIsLoading(true);

    try {
      const organizationId = getOrganizationId();
      if (!organizationId) {
        setIsLoading(false);
        return;
      }

      // Obtener el total de clientes
      const { count: customerCount, error: countError } = await supabase
        .from("customers")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId);

      if (countError) throw countError;

      // Obtener clientes con oportunidades activas
      const { data: opportunitiesData, error: oppsError } = await supabase
        .from("opportunities")
        .select("customer_id")
        .eq("organization_id", organizationId)
        .neq("status", "closed");

      if (oppsError) throw oppsError;

      // Número de clientes únicos con oportunidades activas
      const uniqueCustomersWithOpps = Array.from(new Set(opportunitiesData?.map(o => o.customer_id) || [])).length;

      // Clientes contactados este mes
      const currentDate = new Date();
      const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      
      const { data: recentContacts, error: contactsError } = await supabase
        .from("customer_interactions")
        .select("customer_id")
        .eq("organization_id", organizationId)
        .gte("interaction_date", firstDayOfMonth.toISOString());

      if (contactsError) {
        // Si la tabla no existe, asumimos 0 contactos
        console.warn("Error fetching contacts or table doesn't exist:", contactsError);
        
        setStats({
          total: customerCount || 0,
          activeOpportunities: uniqueCustomersWithOpps,
          contactedThisMonth: 0,
        });
        return;
      }

      // Número de clientes únicos contactados este mes
      const uniqueContactedCustomers = recentContacts ? 
        Array.from(new Set(recentContacts.map(c => c.customer_id))).length : 0;

      setStats({
        total: customerCount || 0,
        activeOpportunities: uniqueCustomersWithOpps,
        contactedThisMonth: uniqueContactedCustomers,
      });
    } catch (err) {
      console.error("Error al cargar estadísticas de clientes:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <Card className={cn(
        theme === "dark" ? "bg-background/50 border-slate-800" : "bg-white"
      )}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="space-y-1">
            <CardTitle className="text-sm font-medium">
              Total de Clientes
            </CardTitle>
            <CardDescription>
              Clientes en su organización
            </CardDescription>
          </div>
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Users className="h-6 w-6" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="text-2xl font-bold">{stats.total}</div>
          )}
        </CardContent>
      </Card>

      <Card className={cn(
        theme === "dark" ? "bg-background/50 border-slate-800" : "bg-white"
      )}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="space-y-1">
            <CardTitle className="text-sm font-medium">
              Con Oportunidades Activas
            </CardTitle>
            <CardDescription>
              Clientes en proceso de venta
            </CardDescription>
          </div>
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <TrendingUp className="h-6 w-6" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="text-2xl font-bold">{stats.activeOpportunities}</div>
          )}
        </CardContent>
      </Card>

      <Card className={cn(
        theme === "dark" ? "bg-background/50 border-slate-800" : "bg-white"
      )}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="space-y-1">
            <CardTitle className="text-sm font-medium">
              Contactados Este Mes
            </CardTitle>
            <CardDescription>
              Clientes con interacciones recientes
            </CardDescription>
          </div>
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Phone className="h-6 w-6" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="text-2xl font-bold">{stats.contactedThisMonth}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
