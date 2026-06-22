'use client';

import React from 'react';

export function ConversationSkeletonItem() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b dark:border-gray-800 border-l-4 border-l-transparent">
      <div className="relative flex-shrink-0">
        <div className="h-12 w-12 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
        <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
          <div className="h-3 w-12 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
        </div>
        <div className="h-3 w-48 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
        <div className="flex gap-1">
          <div className="h-4 w-14 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
          <div className="h-4 w-10 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function ConversationSkeletonList({ count = 6 }: { count?: number }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <ConversationSkeletonItem key={i} />
      ))}
    </div>
  );
}
