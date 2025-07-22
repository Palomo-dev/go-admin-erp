"use client";

import { Mail, Phone, UserCircle, Building, ExternalLink } from "lucide-react";
import { cn } from "@/utils/Utils";
import { Customer } from "@/types/crm";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase/config";

interface CustomerCardProps {
  customer: Customer;
}

export function CustomerCard({ customer }: CustomerCardProps) {
  const { theme } = useTheme();
  const [opportunitiesCount, setOpportunitiesCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadOpportunitiesCount = async () => {
    if (opportunitiesCount !== null || !customer.id) return;
    
    setIsLoading(true);
    try {
      const { count, error } = await supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", customer.id);
      
      if (error) throw error;
      setOpportunitiesCount(count || 0);
    } catch (err) {
      console.error("Error fetching opportunities count:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className={cn(
        "p-4 hover:bg-muted/50 transition-colors",
        theme === "dark" ? "hover:bg-slate-800/50" : "hover:bg-slate-50"
      )}
      onMouseEnter={loadOpportunitiesCount}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <UserCircle className="h-6 w-6" />
          </div>
          <div>
            <h4 className="font-medium">{customer.name}</h4>
            <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
              {customer.email && (
                <div className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />
                  <span>{customer.email}</span>
                </div>
              )}
              
              {customer.phone && (
                <div className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{customer.phone}</span>
                </div>
              )}
              
              {opportunitiesCount !== null && (
                <div className="flex items-center gap-1">
                  <Building className="h-3.5 w-3.5" />
                  <span>
                    {opportunitiesCount} oportunidad{opportunitiesCount !== 1 ? 'es' : ''}
                  </span>
                </div>
              )}
              
              {isLoading && <span className="text-xs">Cargando...</span>}
            </div>
          </div>
        </div>
        
        <Link href={`/app/crm/customers/${customer.id}`} passHref>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <ExternalLink className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
