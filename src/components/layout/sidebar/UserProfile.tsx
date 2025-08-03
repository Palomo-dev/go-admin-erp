'use client';

import React, { memo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { User, CreditCard, LogOut } from 'lucide-react';

interface UserProfileProps {
  collapsed?: boolean;
  userName?: string;
  userRole?: string;
  userEmail?: string;
  onSubscriptionClick?: () => void;
  onSignOut?: () => void;
}

const UserProfile = memo(({ 
  collapsed = false,
  userName = "Pepe Aguilar",
  userRole = "Admin de organi...",
  userEmail = "admin@palomo...",
  onSubscriptionClick,
  onSignOut
}: UserProfileProps) => {
  if (collapsed) {
    return (
      <div className="p-2 border-t border-gray-200">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex justify-center">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {userName.charAt(0)}
                  </span>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              <div className="text-sm">
                <div className="font-medium">{userName}</div>
                <div className="text-gray-500">{userRole}</div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <div className="p-3 border-t border-gray-200 bg-gray-50">
      {/* User Info */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-white text-sm font-medium">
            {userName.charAt(0)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">
            {userName}
          </div>
          <div className="text-xs text-gray-500 truncate">
            {userRole}
          </div>
          <div className="text-xs text-gray-400 truncate">
            {userEmail}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
          onClick={onSubscriptionClick}
        >
          <CreditCard className="h-4 w-4" />
          Mi Suscripción
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 bg-red-600 text-white border-red-600 hover:bg-red-700"
          onClick={onSignOut}
        >
          <LogOut className="h-4 w-4" />
          Cerrar Sesión
        </Button>
      </div>
    </div>
  );
});

UserProfile.displayName = 'UserProfile';

export default UserProfile;
