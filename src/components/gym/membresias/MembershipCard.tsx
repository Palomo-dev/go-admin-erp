'use client';

import React from 'react';
import Link from 'next/link';
import { User, Calendar, Clock, ChevronRight, Snowflake, QrCode, RefreshCw, Snowflake as FreezeIcon, MoreVertical } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/utils/Utils';
import { formatDate } from '@/utils/Utils';
import { Membership, getDaysRemaining, getMembershipStatusColor, getMembershipStatusLabel } from '@/lib/services/gymService';

interface MembershipCardProps {
  membership: Membership;
  onShowQR?: (membership: Membership) => void;
  onRenew?: (membership: Membership) => void;
  onFreeze?: (membership: Membership) => void;
  onUnfreeze?: (membership: Membership) => void;
}

export function MembershipCard({ 
  membership,
  onShowQR,
  onRenew,
  onFreeze,
  onUnfreeze
}: MembershipCardProps) {
  const daysRemaining = getDaysRemaining(membership.end_date);
  const isExpired = daysRemaining < 0;
  const isExpiringSoon = daysRemaining >= 0 && daysRemaining <= 7;
  const customer = membership.customers;
  const plan = membership.membership_plans;

  const handleAction = (e: React.MouseEvent, action: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    action();
  };

  return (
    <Link href={`/app/gym/membresias/${membership.id}`}>
      <Card className={cn(
        "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700",
        "transition-all hover:shadow-md cursor-pointer",
        membership.status === 'frozen' && "border-blue-300 dark:border-blue-700",
        isExpiringSoon && membership.status === 'active' && "border-yellow-300 dark:border-yellow-700"
      )}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-full",
                membership.status === 'active' ? "bg-green-100 dark:bg-green-900/30" :
                membership.status === 'frozen' ? "bg-blue-100 dark:bg-blue-900/30" :
                membership.status === 'expired' ? "bg-red-100 dark:bg-red-900/30" :
                "bg-gray-100 dark:bg-gray-700"
              )}>
                {membership.status === 'frozen' ? (
                  <Snowflake className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                ) : (
                  <User className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                )}
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {customer?.first_name} {customer?.last_name}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {plan?.name}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge className={getMembershipStatusColor(membership.status)}>
                {getMembershipStatusLabel(membership.status)}
              </Badge>

              {/* Menú de acciones rápidas */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white dark:bg-gray-800">
                  {onShowQR && (
                    <DropdownMenuItem onClick={(e) => handleAction(e as any, () => onShowQR(membership))}>
                      <QrCode className="h-4 w-4 mr-2" />
                      Ver QR / Código
                    </DropdownMenuItem>
                  )}
                  
                  {membership.status === 'active' && onFreeze && (
                    <DropdownMenuItem onClick={(e) => handleAction(e as any, () => onFreeze(membership))}>
                      <FreezeIcon className="h-4 w-4 mr-2" />
                      Congelar
                    </DropdownMenuItem>
                  )}
                  
                  {membership.status === 'frozen' && onUnfreeze && (
                    <DropdownMenuItem onClick={(e) => handleAction(e as any, () => onUnfreeze(membership))}>
                      <FreezeIcon className="h-4 w-4 mr-2" />
                      Descongelar
                    </DropdownMenuItem>
                  )}
                  
                  {(membership.status === 'active' || membership.status === 'expired') && onRenew && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={(e) => handleAction(e as any, () => onRenew(membership))}
                        className="text-green-600 dark:text-green-400"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Renovar
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                <Calendar className="h-4 w-4" />
                <span>{formatDate(membership.end_date)}</span>
              </div>
              
              {membership.access_code && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onShowQR?.(membership);
                  }}
                  className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  {membership.access_code}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {membership.status === 'active' && (
                <span className={cn(
                  "text-sm font-medium flex items-center gap-1",
                  isExpired ? "text-red-600 dark:text-red-400" :
                  isExpiringSoon ? "text-yellow-600 dark:text-yellow-400" :
                  "text-green-600 dark:text-green-400"
                )}>
                  <Clock className="h-4 w-4" />
                  {isExpired ? 'Vencida' : `${daysRemaining}d`}
                </span>
              )}
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default MembershipCard;
