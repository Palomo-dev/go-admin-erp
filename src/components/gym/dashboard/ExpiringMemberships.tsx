'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronRight, Download, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import { Membership, getDaysRemaining } from '@/lib/services/gymService';
import { formatDate } from '@/utils/Utils';

interface ExpiringMembershipsProps {
  memberships: Membership[];
  isLoading?: boolean;
  onExport?: () => void;
}

export function ExpiringMemberships({ memberships, isLoading, onExport }: ExpiringMembershipsProps) {
  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Próximos a vencer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse flex items-center gap-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Próximos a vencer
            <Badge variant="secondary" className="ml-2 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
              {memberships.length}
            </Badge>
          </CardTitle>
          {onExport && memberships.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onExport}>
              <Download className="h-4 w-4 mr-1" />
              Exportar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {memberships.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No hay membresías próximas a vencer</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {memberships.map((membership) => {
              const daysRemaining = getDaysRemaining(membership.end_date);
              const isExpired = daysRemaining < 0;
              
              return (
                <Link
                  key={membership.id}
                  href={`/app/gym/membresias/${membership.id}`}
                  className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {membership.customers?.first_name} {membership.customers?.last_name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {membership.membership_plans?.name}
                    </p>
                  </div>
                  
                  <div className="text-right">
                    <Badge className={cn(
                      isExpired 
                        ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                        : daysRemaining <= 3
                          ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
                          : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                    )}>
                      {isExpired ? 'Vencida' : `${daysRemaining} días`}
                    </Badge>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {formatDate(membership.end_date)}
                    </p>
                  </div>
                  
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </Link>
              );
            })}
          </div>
        )}
        
        {memberships.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Link href="/app/gym/membresias?filter=expiring">
              <Button variant="outline" size="sm" className="w-full">
                Ver todas las membresías
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ExpiringMemberships;
