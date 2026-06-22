'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function JobPositionStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i} className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-3 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function JobPositionFiltersSkeleton() {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function JobPositionTableSkeleton() {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                  <th className="h-12 px-4 text-left"><Skeleton className="h-4 w-16" /></th>
                  <th className="h-12 px-4 text-left hidden sm:table-cell"><Skeleton className="h-4 w-24" /></th>
                  <th className="h-12 px-4 text-left hidden md:table-cell"><Skeleton className="h-4 w-12" /></th>
                  <th className="h-12 px-4 text-left hidden lg:table-cell"><Skeleton className="h-4 w-28" /></th>
                  <th className="h-12 px-4 text-center hidden md:table-cell"><Skeleton className="h-4 w-16 mx-auto" /></th>
                  <th className="h-12 px-4 text-center"><Skeleton className="h-4 w-14 mx-auto" /></th>
                  <th className="h-12 px-4 w-10 sm:w-[60px]"></th>
                </tr>
              </thead>
              <tbody>
                {[...Array(6)].map((_, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </td>
                    <td className="py-3 px-4 hidden sm:table-cell">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell">
                      <Skeleton className="h-4 w-32" />
                    </td>
                    <td className="py-3 px-4 text-center hidden md:table-cell">
                      <Skeleton className="h-4 w-6 mx-auto" />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Skeleton className="h-5 w-16 rounded-full mx-auto" />
                    </td>
                    <td className="py-3 px-4">
                      <Skeleton className="h-7 w-7 sm:h-8 sm:w-8 rounded-md" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function JobPositionPageSkeleton() {
  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>

      <JobPositionStatsSkeleton />
      <JobPositionFiltersSkeleton />
      <JobPositionTableSkeleton />
    </div>
  );
}

export default JobPositionPageSkeleton;
