'use client';

import React from 'react';
import { User, Calendar, CreditCard, Hash, Phone, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import { formatDate, formatCurrency } from '@/utils/Utils';
import { Membership, getDaysRemaining, getMembershipStatusColor, getMembershipStatusLabel } from '@/lib/services/gymService';

interface MembershipHeaderProps {
  membership: Membership;
}

export function MembershipHeader({ membership }: MembershipHeaderProps) {
  const daysRemaining = getDaysRemaining(membership.end_date);
  const isExpired = daysRemaining < 0;
  const isExpiringSoon = daysRemaining >= 0 && daysRemaining <= 7;
  const customer = membership.customers;
  const plan = membership.membership_plans;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        {/* Info del cliente */}
        <div className="flex items-start gap-4">
          <div className={cn(
            "p-4 rounded-full",
            membership.status === 'active' ? "bg-green-100 dark:bg-green-900/30" :
            membership.status === 'frozen' ? "bg-blue-100 dark:bg-blue-900/30" :
            "bg-gray-100 dark:bg-gray-700"
          )}>
            <User className={cn(
              "h-8 w-8",
              membership.status === 'active' ? "text-green-600 dark:text-green-400" :
              membership.status === 'frozen' ? "text-blue-600 dark:text-blue-400" :
              "text-gray-600 dark:text-gray-400"
            )} />
          </div>
          
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {customer?.first_name} {customer?.last_name}
              </h2>
              <Badge className={getMembershipStatusColor(membership.status)}>
                {getMembershipStatusLabel(membership.status)}
              </Badge>
            </div>
            
            <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
              {customer?.identification_number && (
                <p className="flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  {customer.identification_number}
                </p>
              )}
              {customer?.phone && (
                <p className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  {customer.phone}
                </p>
              )}
              {customer?.email && (
                <p className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {customer.email}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Info de la membresía */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          <div className="text-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Plan</p>
            <p className="font-semibold text-gray-900 dark:text-white">
              {plan?.name || 'N/A'}
            </p>
          </div>
          
          <div className="text-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Vencimiento</p>
            <p className={cn(
              "font-semibold",
              isExpired ? "text-red-600 dark:text-red-400" :
              isExpiringSoon ? "text-yellow-600 dark:text-yellow-400" :
              "text-gray-900 dark:text-white"
            )}>
              {formatDate(membership.end_date)}
            </p>
          </div>
          
          <div className="text-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Días</p>
            <p className={cn(
              "font-semibold text-lg",
              isExpired ? "text-red-600 dark:text-red-400" :
              isExpiringSoon ? "text-yellow-600 dark:text-yellow-400" :
              "text-green-600 dark:text-green-400"
            )}>
              {isExpired ? Math.abs(daysRemaining) : daysRemaining}
              <span className="text-xs ml-1">{isExpired ? 'vencidos' : 'restantes'}</span>
            </p>
          </div>
          
          <div className="text-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Código</p>
            <p className="font-mono font-semibold text-gray-900 dark:text-white">
              {membership.access_code || 'N/A'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MembershipHeader;
