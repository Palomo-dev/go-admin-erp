'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';

type Temperature = 'cold' | 'warm' | 'hot';

interface TemperatureDotProps {
  temperature?: string | null;
  size?: 'sm' | 'md';
}

const TEMPERATURE_CONFIG: Record<Temperature, { color: string; label: string }> = {
  cold: { color: 'bg-blue-500', label: 'Frío' },
  warm: { color: 'bg-amber-500', label: 'Tibio' },
  hot: { color: 'bg-red-500', label: 'Caliente' },
};

function getTemperatureConfig(temperature?: string | null): Temperature | null {
  if (!temperature) return null;
  const normalized = temperature.toLowerCase().trim();
  if (normalized in TEMPERATURE_CONFIG) {
    return normalized as Temperature;
  }
  return null;
}

export function TemperatureDot({ temperature, size = 'sm' }: TemperatureDotProps) {
  const tempKey = getTemperatureConfig(temperature);

  if (!tempKey) {
    return null;
  }

  const config = TEMPERATURE_CONFIG[tempKey];
  const dotSize = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-block ${dotSize} ${config.color} rounded-full shrink-0 cursor-help`}
            role="img"
            aria-label={config.label}
          />
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs font-medium">{config.label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
