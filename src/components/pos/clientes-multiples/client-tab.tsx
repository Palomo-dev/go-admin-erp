"use client";

import React from "react";
import { Card, CardContent } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { Button } from "@/components/pos/button";
import { cn } from "@/utils/posUtils";
import { useTheme } from "next-themes";

export interface ClientTabProps {
  id: number;
  name: string;
  productCount: number;
  total: number;
  active: boolean;
  onSelect: (id: number) => void;
  onRemove: (id: number) => void;
}

export function ClientTab({
  id,
  name,
  productCount,
  total,
  active,
  onSelect,
  onRemove
}: ClientTabProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Card 
      className={cn(
        "cursor-pointer hover:shadow-md transition-shadow",
        active ? 'border-primary border-2' : isDark ? 'bg-slate-800 border-slate-700' : 'bg-white',
        isDark ? 'text-white' : 'text-gray-900'
      )}
      onClick={() => onSelect(id)}
    >
      <CardContent className="p-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="font-medium">{name}</div>
            <div className={cn(
              "text-sm",
              isDark ? "text-gray-300" : "text-gray-500"
            )}>
              {productCount} productos · ${total.toFixed(2)}
            </div>
          </div>
          <div className="flex gap-1">
            {active && <Badge variant="default">Activo</Badge>}
            <Button 
              variant="outline" 
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(id);
              }}
              className={isDark ? "hover:bg-slate-700" : ""}
            >
              Eliminar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
