'use client';

import React from 'react';
import { 
  Settings, 
  Phone, 
  Mail, 
  MessageCircle, 
  MapPin, 
  FileText,
  Activity
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import { ActivityType, ACTIVITY_TYPE_CONFIG } from '@/types/activity';

interface ActividadIconProps {
  type: ActivityType;
  className?: string;
  variant?: 'default' | 'minimal';
}

const ICON_MAP = {
  [ActivityType.SYSTEM]: Settings,
  [ActivityType.CALL]: Phone,
  [ActivityType.EMAIL]: Mail,
  [ActivityType.WHATSAPP]: MessageCircle,
  [ActivityType.VISIT]: MapPin,
  [ActivityType.NOTE]: FileText,
};

export function ActividadIcon({ 
  type, 
  className,
  variant = 'default' 
}: ActividadIconProps) {
  const config = ACTIVITY_TYPE_CONFIG[type];
  const IconComponent = ICON_MAP[type] || Activity;

  if (variant === 'minimal') {
    return (
      <IconComponent 
        className={cn(
          "w-4 h-4",
          config.color,
          className
        )} 
      />
    );
  }

  return (
    <div className={cn(
      "flex items-center justify-center rounded-full",
      "w-8 h-8",
      config.bgColor,
      "dark:bg-opacity-20",
      className
    )}>
      <IconComponent 
        className={cn(
          "w-4 h-4",
          config.color,
          "dark:opacity-80"
        )} 
      />
    </div>
  );
}
