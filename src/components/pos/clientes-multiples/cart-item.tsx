"use client";

import React from "react";
import { Button } from "@/components/pos/button";
import { useTheme } from "next-themes";
import { cn } from "@/utils/posUtils";

export interface CartItemProps {
  id: number;
  productName: string;
  price: number;
  quantity: number;
  onIncrease: (id: number) => void;
  onDecrease: (id: number) => void;
  onRemove: (id: number) => void;
}

export function CartItem({
  id,
  productName,
  price,
  quantity,
  onIncrease,
  onDecrease,
  onRemove
}: CartItemProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  
  return (
    <div className={cn(
      "flex justify-between items-center border-b pb-2",
      isDark ? "border-slate-700" : "border-gray-200"
    )}>
      <div className="flex-grow">
        <div className={cn(
          isDark ? "text-white" : "text-gray-900"
        )}>{productName}</div>
        <div className={cn(
          "text-sm",
          isDark ? "text-gray-300" : "text-gray-500"
        )}>
          ${price.toFixed(2)}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onDecrease(id)}
          className={isDark ? "bg-slate-700 hover:bg-slate-600" : ""}
        >
          -
        </Button>
        <span className={cn(
          "w-8 text-center",
          isDark ? "text-white" : ""
        )}>
          {quantity}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onIncrease(id)}
          className={isDark ? "bg-slate-700 hover:bg-slate-600" : ""}
        >
          +
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onRemove(id)}
          className={isDark ? "bg-slate-700 hover:bg-slate-600" : ""}
        >
          Eliminar
        </Button>
      </div>
    </div>
  );
}
