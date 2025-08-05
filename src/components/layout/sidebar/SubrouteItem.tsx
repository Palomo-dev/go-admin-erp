'use client';

import React, { memo } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ModuleSubroute } from '@/config/moduleConfig';

interface SubrouteItemProps {
  subroute: ModuleSubroute;
  pathname: string;
}

const SubrouteItem = memo(({ subroute, pathname }: SubrouteItemProps) => {
  const SubIcon = subroute.icon;
  const isSubActive = pathname === subroute.path;
  
  return (
    <Link href={subroute.path}>
      <div className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm",
        isSubActive 
          ? "bg-blue-50 text-blue-700 border-l-2 border-blue-500" 
          : "hover:bg-gray-50 text-gray-600"
      )}>
        <SubIcon className={cn(
          "h-4 w-4",
          isSubActive ? "text-blue-600" : "text-gray-500"
        )} />
        <span>{subroute.name}</span>
      </div>
    </Link>
  );
});

SubrouteItem.displayName = 'SubrouteItem';

export default SubrouteItem;
