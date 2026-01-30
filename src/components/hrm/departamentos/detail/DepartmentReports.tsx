'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FileBarChart,
  ClipboardCheck,
  CalendarOff,
  DollarSign,
  Users,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

interface ReportLink {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  color: string;
  bgColor: string;
}

interface DepartmentReportsProps {
  departmentId: string;
}

export function DepartmentReports({ departmentId }: DepartmentReportsProps) {
  const reports: ReportLink[] = [
    {
      title: 'Reporte de Asistencia',
      description: 'Ver marcaciones y asistencia del departamento',
      icon: <ClipboardCheck className="h-5 w-5" />,
      href: `/app/hrm/reportes/asistencia?department=${departmentId}`,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      title: 'Reporte de Ausencias',
      description: 'Permisos, vacaciones y licencias',
      icon: <CalendarOff className="h-5 w-5" />,
      href: `/app/hrm/reportes/ausencias?department=${departmentId}`,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    },
    {
      title: 'Reporte de Nómina',
      description: 'Costos y pagos del departamento',
      icon: <DollarSign className="h-5 w-5" />,
      href: `/app/hrm/reportes/nomina?department=${departmentId}`,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      title: 'Reporte de Personal',
      description: 'Headcount y rotación del departamento',
      icon: <Users className="h-5 w-5" />,
      href: `/app/hrm/reportes/personal?department=${departmentId}`,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    },
  ];

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
          <FileBarChart className="h-5 w-5 text-blue-600" />
          Reportes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {reports.map((report, index) => (
            <Link key={index} href={report.href}>
              <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${report.bgColor}`}>
                  <span className={report.color}>{report.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white text-sm">
                    {report.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {report.description}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default DepartmentReports;
