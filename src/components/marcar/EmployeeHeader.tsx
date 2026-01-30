'use client';

import { User, Building2, IdCard } from 'lucide-react';
import type { EmployeeInfo } from '@/lib/services/qrAttendanceService';

interface EmployeeHeaderProps {
  employee: EmployeeInfo;
}

export function EmployeeHeader({ employee }: EmployeeHeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
          <User className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900 dark:text-white truncate">
            {employee.employee_name}
          </h2>
          <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            {employee.employee_code && (
              <span className="flex items-center gap-1">
                <IdCard className="h-3 w-3" />
                {employee.employee_code}
              </span>
            )}
            {employee.branch_name && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {employee.branch_name}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default EmployeeHeader;
