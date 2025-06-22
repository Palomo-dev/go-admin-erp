"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PlusCircle, Flame, Leaf, AlignLeft, Check } from "lucide-react";
import { useTheme } from "next-themes";

// Interfaces
interface ProductModifiersProps {
  productName: string;
  onSave: (notes: string, modifiers: string[]) => void;
}

// Modificadores comunes predefinidos
const COMMON_MODIFIERS = [
  { id: 'sin-sal', label: 'Sin sal', icon: <Flame className="h-4 w-4 text-orange-500" /> },
  { id: 'extra-picante', label: 'Extra picante', icon: <Flame className="h-4 w-4 text-red-500" /> },
  { id: 'sin-cebolla', label: 'Sin cebolla', icon: <Leaf className="h-4 w-4 text-green-500" /> },
  { id: 'sin-ajo', label: 'Sin ajo', icon: <Leaf className="h-4 w-4 text-green-500" /> },
  { id: 'sin-lacteos', label: 'Sin lácteos', icon: <Leaf className="h-4 w-4 text-blue-500" /> },
  { id: 'muy-cocido', label: 'Muy cocido', icon: <Flame className="h-4 w-4 text-amber-500" /> },
  { id: 'poco-cocido', label: 'Poco cocido', icon: <Flame className="h-4 w-4 text-blue-500" /> },
];

export function ProductModifiers({
  productName,
  onSave
}: ProductModifiersProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  
  const [customNote, setCustomNote] = useState("");
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, boolean>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Manejar selección de modificadores
  const handleModifierToggle = (modifierId: string) => {
    setSelectedModifiers(prev => ({
      ...prev,
      [modifierId]: !prev[modifierId]
    }));
  };
  
  // Guardar y cerrar
  const handleSave = () => {
    // Obtener modificadores seleccionados
    const modifiers = Object.entries(selectedModifiers)
      .filter(([_, isSelected]) => isSelected)
      .map(([id]) => {
        const modifier = COMMON_MODIFIERS.find(m => m.id === id);
        return modifier ? modifier.label : "";
      })
      .filter(label => label !== "");

    onSave(customNote, modifiers);
    
    // Reset y cerrar
    setCustomNote("");
    setSelectedModifiers({});
    setDialogOpen(false);
  };
  
  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="ml-2">
          <AlignLeft className="h-4 w-4 mr-1" />
          Notas
        </Button>
      </DialogTrigger>
      <DialogContent className={`sm:max-w-md ${isDark ? "bg-slate-900 text-white" : "bg-white"}`}>
        <DialogHeader>
          <DialogTitle>Modificadores para {productName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Nota personalizada</Label>
            <Input
              placeholder="Ej: sin sal, al término medio..."
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              className={isDark ? "bg-slate-800 border-slate-700" : ""}
            />
          </div>
          
          <div className="space-y-2">
            <Label>Modificadores comunes</Label>
            <div className="grid grid-cols-2 gap-2">
              {COMMON_MODIFIERS.map((modifier) => (
                <div 
                  key={modifier.id} 
                  className={`
                    flex items-center p-2 rounded-md cursor-pointer
                    ${selectedModifiers[modifier.id] 
                      ? (isDark ? "bg-blue-900/30 border-blue-700" : "bg-blue-100 border-blue-300") 
                      : (isDark ? "bg-slate-800 border-slate-700" : "bg-gray-100 border-gray-300")
                    }
                    border
                  `}
                  onClick={() => handleModifierToggle(modifier.id)}
                >
                  <div className="mr-2">
                    {modifier.icon}
                  </div>
                  <span>{modifier.label}</span>
                  {selectedModifiers[modifier.id] && (
                    <Check className="ml-auto h-4 w-4 text-blue-500" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave}>
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
