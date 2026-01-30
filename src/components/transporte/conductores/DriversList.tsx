'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  MoreVertical, 
  Edit, 
  Trash2, 
  User,
  IdCard,
  Calendar,
  AlertTriangle,
  Phone,
  Mail,
  Copy,
  Power,
  History
} from 'lucide-react';
import { DriverCredential } from '@/lib/services/transportService';
import { format, isPast, addDays } from 'date-fns';

interface DriversListProps {
  drivers: DriverCredential[];
  isLoading?: boolean;
  onEdit: (driver: DriverCredential) => void;
  onDelete: (driver: DriverCredential) => void;
  onDuplicate: (driver: DriverCredential) => void;
  onToggleStatus: (driver: DriverCredential) => void;
  onViewHistory: (driver: DriverCredential) => void;
}

function getExpiryStatus(date?: string): 'ok' | 'warning' | 'expired' | null {
  if (!date) return null;
  const expiryDate = new Date(date);
  if (isPast(expiryDate)) return 'expired';
  if (expiryDate <= addDays(new Date(), 30)) return 'warning';
  return 'ok';
}

export function DriversList({ 
  drivers, 
  isLoading, 
  onEdit, 
  onDelete,
  onDuplicate,
  onToggleStatus,
  onViewHistory
}: DriversListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-36 bg-gray-200 dark:bg-gray-700 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (drivers.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <User className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No hay conductores
          </h3>
          <p className="text-gray-600 dark:text-gray-400 text-center">
            Registra las credenciales de tus conductores para gestionar su documentación.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {drivers.map((driver) => {
        const profile = driver.employments?.organization_members?.profiles;
        const licenseStatus = getExpiryStatus(driver.license_expiry);
        const medicalStatus = getExpiryStatus(driver.medical_cert_expiry);
        const hasWarnings = licenseStatus === 'warning' || medicalStatus === 'warning';
        const hasExpired = licenseStatus === 'expired' || medicalStatus === 'expired';
        const fullName = profile 
          ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() 
          : 'Sin nombre';

        return (
          <Card
            key={driver.id}
            className={`hover:shadow-md transition-shadow ${hasExpired ? 'border-red-300 dark:border-red-800' : hasWarnings ? 'border-yellow-300 dark:border-yellow-800' : ''}`}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {fullName}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <IdCard className="h-3 w-3" />
                      {driver.license_number}
                    </p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(driver)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDuplicate(driver)}>
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onToggleStatus(driver)}>
                      <Power className="h-4 w-4 mr-2" />
                      {driver.is_active_driver ? 'Desactivar' : 'Activar'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onViewHistory(driver)}>
                      <History className="h-4 w-4 mr-2" />
                      Ver historial
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDelete(driver)}
                      className="text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                <Badge variant="outline">
                  Cat. {driver.license_category}
                </Badge>
                <Badge variant={driver.is_active_driver ? 'default' : 'secondary'}>
                  {driver.is_active_driver ? 'Activo' : 'Inactivo'}
                </Badge>
                {(hasWarnings || hasExpired) && (
                  <Badge variant={hasExpired ? 'destructive' : 'outline'} className={hasWarnings && !hasExpired ? 'border-yellow-500 text-yellow-600' : ''}>
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {hasExpired ? 'Docs vencidos' : 'Docs por vencer'}
                  </Badge>
                )}
              </div>

              <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                <p className={`flex items-center gap-2 ${licenseStatus === 'expired' ? 'text-red-600' : licenseStatus === 'warning' ? 'text-yellow-600' : ''}`}>
                  <Calendar className="h-3 w-3" />
                  Licencia vence: {format(new Date(driver.license_expiry), 'dd/MM/yyyy')}
                </p>
                {driver.medical_cert_expiry && (
                  <p className={`flex items-center gap-2 ${medicalStatus === 'expired' ? 'text-red-600' : medicalStatus === 'warning' ? 'text-yellow-600' : ''}`}>
                    <Calendar className="h-3 w-3" />
                    Examen médico: {format(new Date(driver.medical_cert_expiry), 'dd/MM/yyyy')}
                  </p>
                )}
                {profile?.phone && (
                  <p className="flex items-center gap-2">
                    <Phone className="h-3 w-3" />
                    {profile.phone}
                  </p>
                )}
                {profile?.email && (
                  <p className="flex items-center gap-2">
                    <Mail className="h-3 w-3" />
                    {profile.email}
                  </p>
                )}
                {driver.certifications && driver.certifications.length > 0 && (
                  <div className="pt-2">
                    <p className="text-xs font-medium mb-1">Certificaciones:</p>
                    <div className="flex flex-wrap gap-1">
                      {driver.certifications.map((cert, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {cert}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
