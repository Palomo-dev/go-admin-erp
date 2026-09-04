'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Building2,
  Globe,
  Hotel,
  UtensilsCrossed,
  ShoppingBag,
  Dumbbell,
  Bus,
  ParkingCircle,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { BranchType } from '@/types/branch';
import type { LucideIcon } from 'lucide-react';

export interface OutletOption {
  value: number | null; // null = Global
  label: string;
  branchType: BranchType | null;
}

interface OutletSelectorProps {
  options: OutletOption[];
  value: number | null;
  onChange: (branchId: number | null) => void;
  disabled?: boolean;
}

const BRANCH_TYPE_ICON: Record<string, LucideIcon> = {
  hotel: Hotel,
  restaurant: UtensilsCrossed,
  retail: ShoppingBag,
  gym: Dumbbell,
  transport: Bus,
  parking: ParkingCircle,
  services: Wrench,
};

const BRANCH_TYPE_LABEL: Record<string, string> = {
  hotel: 'Hotel',
  restaurant: 'Restaurante',
  retail: 'Retail',
  gym: 'Gym',
  transport: 'Transporte',
  parking: 'Parking',
  services: 'Servicios',
};

export function OutletSelector({ options, value, onChange, disabled }: OutletSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-white/70 dark:text-blue-700" />
      <Select
        value={value === null ? 'global' : String(value)}
        onValueChange={(val) => onChange(val === 'global' ? null : Number(val))}
        disabled={disabled}
      >
        <SelectTrigger className="h-8 w-[220px] bg-white/10 border-white/20 text-white text-sm dark:bg-gray-800/10 dark:border-gray-700/20">
          <SelectValue placeholder="Seleccionar outlet" />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => {
            const Icon = opt.branchType ? BRANCH_TYPE_ICON[opt.branchType] : Globe;
            return (
              <SelectItem
                key={opt.value === null ? 'global' : opt.value}
                value={opt.value === null ? 'global' : String(opt.value)}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span>{opt.label}</span>
                  {opt.branchType && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {BRANCH_TYPE_LABEL[opt.branchType] ?? opt.branchType}
                    </Badge>
                  )}
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
