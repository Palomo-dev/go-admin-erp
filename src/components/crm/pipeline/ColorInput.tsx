"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils/Utils";

interface ColorInputProps {
  value: string;
  onChange: (value: string) => void;
}

const predefinedColors = [
  "#3498db", // Azul
  "#2ecc71", // Verde
  "#f39c12", // Naranja
  "#e74c3c", // Rojo
  "#9b59b6", // Púrpura
  "#1abc9c", // Turquesa
  "#34495e", // Azul oscuro
  "#7f8c8d", // Gris
];

export function ColorInput({ value, onChange }: ColorInputProps) {
  const [color, setColor] = useState<string>(value || "#3498db");

  useEffect(() => {
    if (value !== color) {
      setColor(value);
    }
  }, [value]);

  const handleColorChange = (newColor: string) => {
    setColor(newColor);
    onChange(newColor);
  };

  return (
    <div className="flex items-center space-x-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-[220px] justify-start text-left font-normal"
          >
            <div
              className="h-4 w-4 rounded-full mr-2"
              style={{ backgroundColor: color }}
            />
            <span>{color}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3">
          <div className="grid grid-cols-4 gap-2">
            {predefinedColors.map((predefinedColor) => (
              <button
                key={predefinedColor}
                className={cn(
                  "h-8 w-8 rounded-full border border-gray-200",
                  color === predefinedColor && "ring-2 ring-primary"
                )}
                style={{ backgroundColor: predefinedColor }}
                onClick={() => handleColorChange(predefinedColor)}
              />
            ))}
          </div>
          <div className="mt-3">
            <label className="text-xs text-muted-foreground">Color personalizado</label>
            <input
              type="color"
              value={color}
              onChange={(e) => handleColorChange(e.target.value)}
              className="w-full h-8 mt-1"
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
