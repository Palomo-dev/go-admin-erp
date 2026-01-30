'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Clock, ChevronRight, RefreshCw } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { formatDate } from '@/utils/Utils';
import { Membership, getDaysRemaining } from '@/lib/services/gymService';

interface MembershipExpiringSectionProps {
  memberships: Membership[];
  isLoading?: boolean;
  onRenew?: (membership: Membership) => void;
}

export function MembershipExpiringSection({ 
  memberships, 
  isLoading,
  onRenew 
}: MembershipExpiringSectionProps) {
  const expiringMemberships = React.useMemo(() => {
    return memberships
      .filter(m => {
        if (m.status !== 'active') return false;
        const days = getDaysRemaining(m.end_date);
        return days >= 0 && days <= 7;
      })
      .sort((a, b) => new Date(a.end_date).getTime() - new Date(b.end_date).getTime())
      .slice(0, 5);
  }, [memberships]);

  if (isLoading) {
    return (
      <Card className="bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800/50">
        <CardHeader className="pb-3">
          <div className="animate-pulse">
            <div className="h-5 bg-yellow-200 dark:bg-yellow-800/50 rounded w-40" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24" />
                </div>
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (expiringMemberships.length === 0) {
    return null;
  }

  return (
    <Card className="bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-400">
          <AlertTriangle className="h-5 w-5" />
          Vencimientos Próximos ({expiringMemberships.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {expiringMemberships.map(membership => {
            const daysRemaining = getDaysRemaining(membership.end_date);
            const customer = membership.customers;
            const plan = membership.membership_plans;

            return (
              <div 
                key={membership.id}
                className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2 rounded-full",
                    daysRemaining <= 2 
                      ? "bg-red-100 dark:bg-red-900/30" 
                      : "bg-yellow-100 dark:bg-yellow-900/30"
                  )}>
                    <Clock className={cn(
                      "h-4 w-4",
                      daysRemaining <= 2 
                        ? "text-red-600 dark:text-red-400" 
                        : "text-yellow-600 dark:text-yellow-400"
                    )} />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {customer?.first_name} {customer?.last_name}
                    </p>
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <span>{plan?.name}</span>
                      <span>•</span>
                      <span>Vence: {formatDate(membership.end_date)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge className={cn(
                    daysRemaining <= 2 
                      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                      : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                  )}>
                    {daysRemaining === 0 ? 'Hoy' : daysRemaining === 1 ? 'Mañana' : `${daysRemaining} días`}
                  </Badge>

                  {onRenew && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.preventDefault();
                        onRenew(membership);
                      }}
                      className="border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20"
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Renovar
                    </Button>
                  )}

                  <Link href={`/app/gym/membresias/${membership.id}`}>
                    <Button size="sm" variant="ghost">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default MembershipExpiringSection;
