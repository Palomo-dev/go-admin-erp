'use client';

import React, { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase/config';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface Branch {
  id: number;
  name: string;
  is_main?: boolean;
}

interface SelectorSucursalProps {
  organizationId: number | undefined;
  onOriginChange: (branchId: number) => void;
  onDestChange: (branchId: number) => void;
  disabled?: boolean;
  originBranchId?: number;
  destBranchId?: number;
}

export default function SelectorSucursal({ 
  organizationId, 
  onOriginChange, 
  onDestChange, 
  disabled = false,
  originBranchId,
  destBranchId
}: SelectorSucursalProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Cuando se monta el componente, carga las sucursales de la organización
  useEffect(() => {
    const fetchBranches = async () => {
      if (!organizationId) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      setError(null);
      
      try {
        const { data, error } = await supabase
          .from('branches')
          .select('id, name, is_main')
          .eq('organization_id', organizationId)
          .order('is_main', { ascending: false })
          .order('name');
          
        if (error) throw error;
        
        setBranches(data || []);
        
        // Si hay valores predeterminados y sucursales disponibles, asignarlos
        if (data && data.length > 0) {
          if (!originBranchId) {
            // Si no se especificó un origen, seleccionar la sucursal principal
            const mainBranch = data.find(b => b.is_main);
            if (mainBranch) onOriginChange(mainBranch.id);
          }
        }
      } catch (err: any) {
        console.error('Error al cargar sucursales:', err);
        setError(err.message || 'Error al cargar las sucursales');
      } finally {
        setLoading(false);
      }
    };
    
    fetchBranches();
  }, [organizationId]);
  
  // Maneja el cambio de sucursal de origen
  const handleOriginChange = (value: string) => {
    const branchId = parseInt(value);
    onOriginChange(branchId);
    
    // Si el destino es igual al nuevo origen, resetear el destino
    if (destBranchId === branchId) {
      onDestChange(0);
    }
  };
  
  // Maneja el cambio de sucursal de destino
  const handleDestChange = (value: string) => {
    onDestChange(parseInt(value));
  };
  
  if (error) {
    return (
      <Alert variant="destructive" className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-2">
        <Label htmlFor="origin">Sucursal de Origen</Label>
        <Select
          disabled={disabled || loading || branches.length === 0}
          value={originBranchId?.toString() || ''}
          onValueChange={handleOriginChange}
        >
          <SelectTrigger id="origin">
            <SelectValue placeholder="Selecciona la sucursal de origen" />
          </SelectTrigger>
          <SelectContent>
            {branches.map((branch) => (
              <SelectItem 
                key={`origin-${branch.id}`} 
                value={branch.id.toString()}
              >
                {branch.name} {branch.is_main ? "(Principal)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="destination">Sucursal de Destino</Label>
        <Select
          disabled={disabled || loading || branches.length === 0 || !originBranchId}
          value={destBranchId?.toString() || ''}
          onValueChange={handleDestChange}
        >
          <SelectTrigger id="destination">
            <SelectValue placeholder="Selecciona la sucursal de destino" />
          </SelectTrigger>
          <SelectContent>
            {branches
              .filter(branch => branch.id !== originBranchId) // Excluir la sucursal de origen
              .map((branch) => (
                <SelectItem 
                  key={`dest-${branch.id}`} 
                  value={branch.id.toString()}
                >
                  {branch.name} {branch.is_main ? "(Principal)" : ""}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
