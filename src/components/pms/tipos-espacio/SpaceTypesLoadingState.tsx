'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function SpaceTypesLoadingState() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[...Array(6)].map((_, i) => (
        <Card key={i} className="p-4">
          <div className="space-y-3">
            <div className="flex justify-between">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
            <Skeleton className="h-4 w-1/2" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-24" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
