"use client";

import React from "react";
import { useTheme } from "next-themes";
import { cn } from "@/utils/posUtils";

export interface ProductItemProps {
  id: number;
  name: string;
  category: string;
  price: number;
  image?: string; 
  onClick: (id: number) => void;
}

export function ProductItem({
  id,
  name,
  category,
  price,
  image,
  onClick
}: ProductItemProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div
      className={cn(
        "flex justify-between items-center border rounded-md p-3 cursor-pointer",
        isDark 
          ? "bg-slate-800 border-slate-700 text-white hover:bg-slate-700" 
          : "bg-white hover:bg-gray-50"
      )}
      onClick={() => onClick(id)}
    >
      <div className="flex items-center gap-3">
        {image && (
          <div className="w-12 h-12 rounded overflow-hidden bg-gray-200 flex-shrink-0">
            <img src={image} alt={name} className="w-full h-full object-cover" />
          </div>
        )}
        <div>
          <div className="font-medium">{name}</div>
          <div className={cn(
            "text-sm",
            isDark ? "text-gray-300" : "text-gray-500"
          )}>
            {category}
          </div>
        </div>
      </div>
      <div className="font-medium">
        ${price.toFixed(2)}
      </div>
    </div>
  );
}
