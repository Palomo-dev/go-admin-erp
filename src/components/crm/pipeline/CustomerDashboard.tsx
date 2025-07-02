"use client";

import { useState } from "react";
import { UserPlus, Filter } from "lucide-react";
import { cn } from "@/utils/Utils";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { CustomerList } from "./CustomerList";
import { CustomerSummary } from "./CustomerSummary";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export function CustomerDashboard() {
  const { theme } = useTheme();
  const [filterActive, setFilterActive] = useState(false);

  return (
    <div>
      <CustomerSummary />

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">
          Clientes
        </h2>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                className={cn(filterActive && "bg-primary/10")}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filtrar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <DropdownMenuLabel>Filtrar por</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setFilterActive(!filterActive)}>
                Recientes primero
              </DropdownMenuItem>
              <DropdownMenuItem>Con oportunidades activas</DropdownMenuItem>
              <DropdownMenuItem>Sin oportunidades</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm">
            <UserPlus className="h-4 w-4 mr-2" />
            Nuevo Cliente
          </Button>
        </div>
      </div>

      <div className={cn(
        "grid gap-6",
        "grid-cols-1",
        "xl:grid-cols-3"
      )}>
        <div className="xl:col-span-3">
          <CustomerList />
        </div>
      </div>
    </div>
  );
}
