"use client";

import { useEffect, useState } from "react";
import { Loader2, UserCircle, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase/config";
import { cn } from "@/utils/Utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { CustomerCard } from "./CustomerCard";
import { Customer } from "@/types/crm";

export function CustomerList() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
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

  const fetchCustomers = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const organizationId = getOrganizationId();
      if (!organizationId) {
        setError("No se encontró la organización activa");
        setIsLoading(false);
        return;
      }

      let query = supabase
        .from("customers")
        .select("id, name, email, phone")
        .eq("organization_id", organizationId);
      
      if (searchQuery) {
        query = query.ilike("name", `%${searchQuery}%`);
      }
      
      const { data, error: fetchError } = await query.order("name");

      if (fetchError) throw fetchError;
      
      setCustomers(data || []);
    } catch (err: any) {
      console.error("Error al cargar clientes:", err);
      setError(err.message || "Error al cargar los datos de clientes");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [searchQuery]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const clearSearch = () => {
    setSearchQuery("");
  };

  return (
    <div className={cn(
      "border rounded-md",
      theme === "dark" ? "bg-background/50 border-slate-800" : "bg-white"
    )}>
      <div className="p-4 border-b">
        <h3 className="text-lg font-medium">Clientes</h3>
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Cargando clientes..." : `${customers.length} clientes encontrados`}
        </p>
        <div className="mt-2 relative">
          <Input
            placeholder="Buscar clientes..."
            value={searchQuery}
            onChange={handleSearch}
            className="pl-8"
          />
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1 h-6 w-6 p-0"
              onClick={clearSearch}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="divide-y">
        {isLoading ? (
          <div className="flex items-center justify-center p-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-destructive">
            <p>{error}</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="p-8 text-center">
            <UserCircle className="h-10 w-10 mx-auto text-muted-foreground" />
            <h4 className="mt-2 font-medium">No hay clientes</h4>
            <p className="text-sm text-muted-foreground mt-1">
              {searchQuery
                ? "No se encontraron clientes con ese nombre"
                : "No hay clientes registrados aún"}
            </p>
          </div>
        ) : (
          customers.map((customer) => (
            <CustomerCard key={customer.id} customer={customer} />
          ))
        )}
      </div>
    </div>
  );
}
