'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/config';
import { formatDate } from '@/utils/Utils';

interface InfoTabProps {
  clienteId: string;
  organizationId: number;
}

export default function InfoTab({ clienteId, organizationId }: InfoTabProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clienteInfo, setClienteInfo] = useState<any>(null);
  const [municipalityName, setMunicipalityName] = useState<string | null>(null);
  const [municipalityState, setMunicipalityState] = useState<string | null>(null);
  const [municipalityPostalCode, setMunicipalityPostalCode] = useState<string | null>(null);

  // Cargar datos completos del cliente
  useEffect(() => {
    const fetchClienteData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Obtener información completa del cliente
        const { data, error } = await supabase
          .from('customers')
          .select('*')
          .eq('id', clienteId)
          .eq('organization_id', organizationId)
          .single();
        
        if (error) throw error;
        
        if (!data) {
          setError('No se encontraron datos del cliente');
          return;
        }
        
        setClienteInfo(data);
        
        // Cargar nombre del municipio si existe
        if (data.fiscal_municipality_id) {
          const { data: muni } = await supabase
            .from('municipalities')
            .select('code, name, state_name')
            .eq('id', data.fiscal_municipality_id)
            .single();
          if (muni) {
            setMunicipalityName(`${muni.name} (${muni.code}) - ${muni.state_name}`);
            setMunicipalityState(muni.state_name);
            setMunicipalityPostalCode(muni.code);
          }
        }
      } catch (err: any) {
        console.error('Error al cargar datos completos del cliente:', err);
        setError(err.message || 'Error al cargar información del cliente');
      } finally {
        setLoading(false);
      }
    };
    
    fetchClienteData();
  }, [clienteId, organizationId]);

  if (loading) {
    return (
      <div className="w-full flex justify-center items-center py-12">
        <div className="flex flex-col items-center">
          <div className="loading loading-spinner loading-md text-primary mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Cargando información detallada...</p>
        </div>
      </div>
    );
  }

  if (error || !clienteInfo) {
    return (
      <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/20 rounded-lg p-4 my-4">
        <p className="text-red-600 dark:text-red-400 font-medium">Error: {error || 'No se pudo cargar la información del cliente'}</p>
      </div>
    );
  }

  // Formatear las fechas si existen
  const createdAt = clienteInfo.created_at ? formatDate(new Date(clienteInfo.created_at)) : 'No disponible';
  const updatedAt = clienteInfo.updated_at ? formatDate(new Date(clienteInfo.updated_at)) : 'No disponible';

  // Extraer los roles del cliente (si existen)
  const roles = clienteInfo.roles || [];
  const rolesFormatted = Array.isArray(roles) && roles.length > 0 
    ? roles.join(', ') 
    : 'No especificado';

  // Extraer responsabilidades fiscales
  const fiscalResp = clienteInfo.fiscal_responsibilities || [];
  const fiscalFormatted = Array.isArray(fiscalResp) && fiscalResp.length > 0
    ? fiscalResp.join(', ')
    : 'No especificado';

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">Información completa del cliente</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Información personal */}
        <Card>
          <CardHeader>
            <CardTitle>Datos personales</CardTitle>
            <CardDescription>Información básica de contacto e identificación</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Nombre completo</p>
                <p>{clienteInfo.full_name || `${clienteInfo.first_name || ''} ${clienteInfo.last_name || ''}`.trim() || 'No especificado'}</p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Correo electrónico</p>
                <p>{clienteInfo.email || 'No especificado'}</p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Teléfono</p>
                <p>{clienteInfo.phone || 'No especificado'}</p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Identificación</p>
                <p>{clienteInfo.identification_type ? `${clienteInfo.identification_type}: ${clienteInfo.identification_number || 'No especificado'}` : 'No especificado'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Información de dirección */}
        <Card>
          <CardHeader>
            <CardTitle>Dirección</CardTitle>
            <CardDescription>Datos de ubicación</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Dirección completa</p>
                <p>{clienteInfo.address || 'No especificado'}</p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Municipio</p>
                <p>{municipalityName || 'No especificado'}</p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Estado/Provincia</p>
                <p>{municipalityState || 'No especificado'}</p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Código postal</p>
                <p>{municipalityPostalCode || 'No especificado'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Datos Empresariales y Fiscales */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Datos Empresariales y Fiscales</CardTitle>
          <CardDescription>Información fiscal y comercial</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Razón Social</p>
              <p>{clienteInfo.company_name || 'No especificado'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Nombre Comercial</p>
              <p>{clienteInfo.trade_name || 'No especificado'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Dígito de Verificación (DV)</p>
              <p>{clienteInfo.dv != null ? clienteInfo.dv : 'No especificado'}</p>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Responsabilidad Fiscal (DIAN)</p>
            <div className="flex flex-wrap gap-2 mt-1">
              {fiscalResp.length > 0 ? fiscalResp.map((code: string) => (
                <span key={code} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  {code}
                </span>
              )) : <p>No especificado</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* Metadatos y preferencias */}
        <Card>
          <CardHeader>
            <CardTitle>Roles y etiquetas</CardTitle>
            <CardDescription>Clasificación del cliente</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Roles</p>
                <p>{rolesFormatted}</p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Etiquetas</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {Array.isArray(clienteInfo.tags) && clienteInfo.tags.length > 0 ? (
                    clienteInfo.tags.map((tag: string, index: number) => (
                      <span 
                        key={index}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
                      >
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400">Sin etiquetas</span>
                  )}
                </div>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Cliente registrado</p>
                <p>{clienteInfo.is_registered ? 'Sí' : 'No'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Información del sistema */}
        <Card>
          <CardHeader>
            <CardTitle>Datos del sistema</CardTitle>
            <CardDescription>Información técnica</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">ID del cliente</p>
                <p className="font-mono text-sm">{clienteInfo.id}</p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">ID de organización</p>
                <p>{clienteInfo.organization_id}</p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Fecha de alta</p>
                <p>{createdAt}</p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Última actualización</p>
                <p>{updatedAt}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Notas */}
      <Card>
        <CardHeader>
          <CardTitle>Notas</CardTitle>
          <CardDescription>Información adicional sobre el cliente</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 whitespace-pre-wrap">
            {clienteInfo.notes ? (
              <p>{clienteInfo.notes}</p>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 italic">No hay notas disponibles para este cliente.</p>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Preferencias */}
      <Card>
        <CardHeader>
          <CardTitle>Preferencias</CardTitle>
          <CardDescription>Preferencias personalizadas del cliente</CardDescription>
        </CardHeader>
        <CardContent>
          {clienteInfo.preferences ? (
            <pre className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 overflow-x-auto text-sm">
              {JSON.stringify(clienteInfo.preferences, null, 2)}
            </pre>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 italic">No hay preferencias registradas para este cliente.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
