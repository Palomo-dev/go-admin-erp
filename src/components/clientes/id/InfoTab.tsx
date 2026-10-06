'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/config';
import { Building2 } from 'lucide-react';
import { CardListSkeleton } from '@/components/common/PageSkeletons';
import { mensajeError, useFechasFicha } from './useFechasFicha';
import { DatosImportadosLead } from '@/components/crm/leads/DatosImportadosLead';
import { cargoImportado, departamentoImportado, tieneDatosImportados } from '@/lib/crm/importacionLeads/datosFicha';

interface InfoTabProps {
  clienteId: string;
  organizationId: number;
}

/** Columnas de `customers` que muestra la pestaña. */
interface ClienteInfo {
  id: string;
  organization_id: number;
  customer_type?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  trade_name?: string | null;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  identification_type?: string | null;
  identification_number?: string | null;
  address?: string | null;
  city?: string | null;
  /** `importacion` y `lead` vienen del importador de leads (ver `datosImportadosDe`). */
  metadata?: { importacion?: unknown; lead?: unknown } | null;
  fiscal_municipality_id?: string | number | null;
  fiscal_responsibilities?: string[] | null;
  dv?: number | null;
  roles?: string[] | null;
  tags?: string[] | null;
  is_registered?: boolean | null;
  notes?: string | null;
  preferences?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface PersonaVinculada {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface EnlaceEmpresa {
  is_primary?: boolean | null;
  position?: string | null;
  person?: PersonaVinculada | PersonaVinculada[] | null;
  company?: { id?: string; full_name?: string | null } | { id?: string; full_name?: string | null }[] | null;
}

const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export default function InfoTab({ clienteId, organizationId }: InfoTabProps) {
  const t = useTranslations('clientes.ficha');
  const tImp = useTranslations('crm.datosImportados');
  const { instante } = useFechasFicha();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ mensaje: string | null; sinDatos?: boolean } | null>(null);
  const [clienteInfo, setClienteInfo] = useState<ClienteInfo | null>(null);
  const [municipalityName, setMunicipalityName] = useState<string | null>(null);
  const [municipalityState, setMunicipalityState] = useState<string | null>(null);
  const [municipalityPostalCode, setMunicipalityPostalCode] = useState<string | null>(null);
  const [primaryContact, setPrimaryContact] = useState<{ name: string; email: string | null; phone: string | null; position: string | null } | null>(null);
  const [linkedCompanies, setLinkedCompanies] = useState<Array<{ id: string; name: string | null; position: string | null; is_primary: boolean }>>([]);

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
          setError({ mensaje: null, sinDatos: true });
          return;
        }

        setClienteInfo(data as ClienteInfo);

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

        // Si es persona, cargar las empresas a las que está vinculada
        if (data.customer_type !== 'company') {
          const { data: companyLinks } = await supabase
            .from('customer_company_links')
            .select(`
              is_primary,
              position,
              company:customers!customer_company_links_company_id_fkey(
                id,
                full_name
              )
            `)
            .eq('person_id', clienteId)
            .order('is_primary', { ascending: false });

          if (companyLinks && companyLinks.length > 0) {
            const companies = (companyLinks as EnlaceEmpresa[]).map((link) => {
              const company = uno(link.company);
              return {
                id: company?.id || '',
                name: company?.full_name || null,
                position: link.position || null,
                is_primary: link.is_primary || false,
              };
            }).filter((c) => c.id);
            setLinkedCompanies(companies);
          }
        }

        // Si es empresa, cargar el contacto principal desde customer_company_links
        if (data.customer_type === 'company') {
          const { data: linkData } = await supabase
            .from('customer_company_links')
            .select(`
              is_primary,
              position,
              person:customers!customer_company_links_person_id_fkey(
                first_name,
                last_name,
                email,
                phone
              )
            `)
            .eq('company_id', clienteId)
            .order('is_primary', { ascending: false });

          if (linkData && linkData.length > 0) {
            const enlaces = linkData as EnlaceEmpresa[];
            const primary = enlaces.find((l) => l.is_primary) || enlaces[0];
            const person = uno(primary.person);
            if (person) {
              setPrimaryContact({
                name: `${person.first_name || ''} ${person.last_name || ''}`.trim(),
                email: person.email || null,
                phone: person.phone || null,
                position: primary.position || null,
              });
            }
          }
        }
      } catch (err) {
        console.error('Error al cargar datos completos del cliente:', err);
        setError({ mensaje: mensajeError(err) });
      } finally {
        setLoading(false);
      }
    };

    fetchClienteData();
  }, [clienteId, organizationId]);

  if (loading) {
    return (
      <div className="py-4">
        <CardListSkeleton cards={4} columns="1" />
      </div>
    );
  }

  if (error || !clienteInfo) {
    return (
      <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/20 rounded-lg p-4 my-4">
        <p className="text-red-600 dark:text-red-400 font-medium">
          {t('info.error', {
            mensaje:
              error?.mensaje ||
              (error?.sinDatos ? t('info.sinDatos') : error ? t('info.errorCarga') : t('info.noSePudoCargar')),
          })}
        </p>
      </div>
    );
  }

  const noEspecificado = t('info.noEspecificado');

  // Formatear las fechas si existen (created_at y updated_at son timestamptz)
  const createdAt = clienteInfo.created_at ? instante(clienteInfo.created_at) : t('info.noDisponible');
  const updatedAt = clienteInfo.updated_at ? instante(clienteInfo.updated_at) : t('info.noDisponible');

  // Extraer los roles del cliente (si existen)
  const roles = clienteInfo.roles || [];
  const rolesFormatted = Array.isArray(roles) && roles.length > 0
    ? roles.join(', ')
    : noEspecificado;

  // Extraer responsabilidades fiscales
  const fiscalResp = clienteInfo.fiscal_responsibilities || [];

  const isCompany = clienteInfo?.customer_type === 'company';
  const importacion = clienteInfo.metadata?.importacion;
  const leadMeta = clienteInfo.metadata?.lead;
  // Empresa sin persona vinculada: el contacto del alta (p. ej. importado) vive en first/last_name.
  const contactoPropio = isCompany && !primaryContact ? `${clienteInfo.first_name || ''} ${clienteInfo.last_name || ''}`.trim() : '';
  const cargoPropio = contactoPropio ? cargoImportado(importacion, leadMeta) : null;
  const departamento = municipalityState || departamentoImportado(importacion, leadMeta);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">{t('info.titulo')}</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Información personal / empresarial */}
        <Card>
          <CardHeader>
            <CardTitle>{isCompany ? t('info.datosEmpresa') : t('info.datosPersonales')}</CardTitle>
            <CardDescription>{isCompany ? t('info.datosEmpresaDescripcion') : t('info.datosPersonalesDescripcion')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{isCompany ? t('info.razonSocial') : t('info.nombreCompleto')}</p>
                <p>{clienteInfo.full_name || `${clienteInfo.first_name || ''} ${clienteInfo.last_name || ''}`.trim() || noEspecificado}</p>
              </div>

              {isCompany && primaryContact && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('info.personaContacto')}</p>
                  <p>
                    {primaryContact.position
                      ? t('info.contactoConCargo', { nombre: primaryContact.name, cargo: primaryContact.position })
                      : primaryContact.name}
                  </p>
                  {primaryContact.email && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{primaryContact.email}</p>
                  )}
                  {primaryContact.phone && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{primaryContact.phone}</p>
                  )}
                </div>
              )}

              {contactoPropio && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('info.personaContacto')}</p>
                  <p>{cargoPropio ? t('info.contactoConCargo', { nombre: contactoPropio, cargo: cargoPropio }) : contactoPropio}</p>
                </div>
              )}

              {isCompany && clienteInfo.trade_name && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('info.nombreComercial')}</p>
                  <p>{clienteInfo.trade_name}</p>
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('info.correo')}</p>
                <p>{clienteInfo.email || noEspecificado}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('info.telefono')}</p>
                <p>{clienteInfo.phone || noEspecificado}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('info.identificacion')}</p>
                <p>
                  {clienteInfo.identification_type
                    ? t('info.identificacionValor', {
                        tipo: clienteInfo.identification_type,
                        numero: clienteInfo.identification_number || noEspecificado,
                      })
                    : noEspecificado}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Información de dirección */}
        <Card>
          <CardHeader>
            <CardTitle>{t('info.direccion')}</CardTitle>
            <CardDescription>{t('info.direccionDescripcion')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('info.direccionCompleta')}</p>
                <p>{clienteInfo.address || noEspecificado}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{tImp('campos.ciudad')}</p>
                <p>{clienteInfo.city || noEspecificado}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('info.municipio')}</p>
                <p>{municipalityName || noEspecificado}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('info.estadoProvincia')}</p>
                <p>{departamento || noEspecificado}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('info.codigoPostal')}</p>
                <p>{municipalityPostalCode || noEspecificado}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Empresas vinculadas - solo para personas */}
      {!isCompany && linkedCompanies.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              {t('info.empresasVinculadas')}
            </CardTitle>
            <CardDescription>{t('info.empresasVinculadasDescripcion')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {linkedCompanies.map((company) => (
                <div key={company.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                      <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <Link href={`/app/clientes/${company.id}`} className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                        {company.name ?? t('comun.sinNombre')}
                      </Link>
                      {company.position && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{company.position}</p>
                      )}
                    </div>
                  </div>
                  {company.is_primary && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                      {t('info.principal')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Datos Empresariales y Fiscales - solo mostrar si hay datos */}
      {(isCompany || clienteInfo.company_name || clienteInfo.trade_name || clienteInfo.dv != null || fiscalResp.length > 0) && (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{isCompany ? t('info.datosFiscales') : t('info.datosEmpresarialesFiscales')}</CardTitle>
          <CardDescription>{t('info.datosFiscalesDescripcion')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {!isCompany && (
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('info.razonSocial')}</p>
                <p>{clienteInfo.company_name || noEspecificado}</p>
              </div>
            )}
            {!isCompany && (
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('info.nombreComercial')}</p>
                <p>{clienteInfo.trade_name || noEspecificado}</p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('info.digitoVerificacion')}</p>
              <p>{clienteInfo.dv != null ? clienteInfo.dv : noEspecificado}</p>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('info.responsabilidadFiscal')}</p>
            <div className="flex flex-wrap gap-2 mt-1">
              {fiscalResp.length > 0 ? fiscalResp.map((code: string) => (
                <span key={code} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  {code}
                </span>
              )) : <p>{noEspecificado}</p>}
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* Metadatos y preferencias */}
        <Card>
          <CardHeader>
            <CardTitle>{t('info.rolesEtiquetas')}</CardTitle>
            <CardDescription>{t('info.rolesEtiquetasDescripcion')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('info.roles')}</p>
                <p>{rolesFormatted}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('info.etiquetas')}</p>
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
                    <span className="text-gray-500 dark:text-gray-400">{t('info.sinEtiquetas')}</span>
                  )}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('info.clienteRegistrado')}</p>
                <p>{clienteInfo.is_registered ? t('info.si') : t('info.no')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Información del sistema */}
        <Card>
          <CardHeader>
            <CardTitle>{t('info.datosSistema')}</CardTitle>
            <CardDescription>{t('info.datosSistemaDescripcion')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('info.idCliente')}</p>
                <p className="font-mono text-sm">{clienteInfo.id}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('info.idOrganizacion')}</p>
                <p>{clienteInfo.organization_id}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('info.fechaAlta')}</p>
                <p>{createdAt}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('info.ultimaActualizacion')}</p>
                <p>{updatedAt}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Datos del archivo de importación sin columna propia en la ficha */}
      {tieneDatosImportados(importacion, leadMeta) && (
        <Card>
          <CardHeader>
            <CardTitle>{tImp('titulo')}</CardTitle>
            <CardDescription>{tImp('descripcion')}</CardDescription>
          </CardHeader>
          <CardContent>
            <DatosImportadosLead importacion={importacion} lead={leadMeta} />
          </CardContent>
        </Card>
      )}

      {/* Notas */}
      <Card>
        <CardHeader>
          <CardTitle>{t('info.notas')}</CardTitle>
          <CardDescription>{t('info.notasDescripcion')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 whitespace-pre-wrap">
            {clienteInfo.notes ? (
              <p>{clienteInfo.notes}</p>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 italic">{t('info.sinNotas')}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preferencias */}
      <Card>
        <CardHeader>
          <CardTitle>{t('info.preferencias')}</CardTitle>
          <CardDescription>{t('info.preferenciasDescripcion')}</CardDescription>
        </CardHeader>
        <CardContent>
          {clienteInfo.preferences && Object.keys(clienteInfo.preferences).length > 0 ? (
            <pre className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 overflow-x-auto text-sm">
              {JSON.stringify(clienteInfo.preferences, null, 2)}
            </pre>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 italic">{t('info.sinPreferencias')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
