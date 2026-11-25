'use client';

/**
 * Pestaña «Información» de la ficha (Figma 06 Clientes 331:113517): tarjetas
 * en dos columnas con filas etiqueta / valor, lápiz que lleva a «Editar» y
 * «Solo lectura» en las que no se editan desde el formulario.
 */

import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import { Building2, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { mensajeError, useFechasFicha } from './useFechasFicha';
import { DatosImportadosLead } from '@/components/crm/leads/DatosImportadosLead';
import { cargoImportado, contactoImportado, departamentoImportado, telefonosAdicionalesDe, tieneDatosImportados } from '@/lib/crm/importacionLeads/datosFicha';
import { TarjetaFacturacionCliente } from '@/components/clientes/facturacion/TarjetaFacturacionCliente';
import { AvisoRevisionFactura } from '@/components/clientes/facturacion/AvisoRevisionFactura';
import { etiquetaDocumento } from '@/lib/clientes/facturacionElectronica';

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
  do_not_call?: boolean | null;
  timezone?: string | null;
  company_size?: string | null;
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
  // La tarjeta de facturación y el aviso de revisión se recargan juntos; la ficha, tras «Usar este».
  const [versionFacturacion, setVersionFacturacion] = useState(0);
  const [recargaFicha, setRecargaFicha] = useState(0);

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
  }, [clienteId, organizationId, recargaFicha]);

  // Al recargar tras una revisión no se vuelve al esqueleto: la ficha se actualiza en su sitio.
  if (loading && !clienteInfo) {
    return (
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error || !clienteInfo) {
    return (
      <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle p-4 text-sm font-medium text-danger-text">
        {t('info.error', {
          mensaje:
            error?.mensaje ||
            (error?.sinDatos ? t('info.sinDatos') : error ? t('info.errorCarga') : t('info.noSePudoCargar')),
        })}
      </p>
    );
  }

  const noEspecificado = t('info.noEspecificado');
  const editar = `/app/clientes/${encodeURIComponent(clienteInfo.id)}/editar`;

  // created_at y updated_at son timestamptz: zona de la organización.
  const createdAt = clienteInfo.created_at ? instante(clienteInfo.created_at) : t('info.noDisponible');
  const updatedAt = clienteInfo.updated_at ? instante(clienteInfo.updated_at) : t('info.noDisponible');

  const roles = clienteInfo.roles || [];
  const rolesFormatted = Array.isArray(roles) && roles.length > 0 ? roles.join(', ') : noEspecificado;

  const isCompany = clienteInfo?.customer_type === 'company';
  const importacion = clienteInfo.metadata?.importacion;
  const leadMeta = clienteInfo.metadata?.lead;
  // Empresa sin persona vinculada: el contacto del alta (p. ej. importado) vive en first/last_name.
  const contactoPropio = isCompany && !primaryContact ? `${clienteInfo.first_name || ''} ${clienteInfo.last_name || ''}`.trim() : '';
  const contactoArchivo = isCompany && !primaryContact && !contactoPropio ? contactoImportado(importacion, leadMeta) : null;
  const nombreContacto = contactoPropio || contactoArchivo || '';
  const cargoPropio = nombreContacto ? cargoImportado(importacion, leadMeta) : null;
  const otrosTelefonos = telefonosAdicionalesDe(importacion, leadMeta, clienteInfo.notes, clienteInfo.phone);
  const departamento = municipalityState || departamentoImportado(importacion, leadMeta);
  const preferencias = clienteInfo.preferences && typeof clienteInfo.preferences === 'object' ? Object.entries(clienteInfo.preferences) : [];
  const valorPreferencia = (v: unknown) => (v === null || v === undefined ? noEspecificado : typeof v === 'object' ? JSON.stringify(v) : String(v));

  const datosPrincipales = (
    <Seccion
      titulo={isCompany ? t('info.datosEmpresa') : t('info.datosPersonales')}
      descripcion={isCompany ? t('info.datosEmpresaDescripcion') : t('info.datosPersonalesDescripcion')}
      editar={editar}
    >
      <Dato etiqueta={isCompany ? t('info.razonSocial') : t('info.nombreCompleto')}>
        {clienteInfo.full_name || `${clienteInfo.first_name || ''} ${clienteInfo.last_name || ''}`.trim() || noEspecificado}
      </Dato>
      {isCompany && clienteInfo.trade_name && <Dato etiqueta={t('info.nombreComercial')}>{clienteInfo.trade_name}</Dato>}
      {isCompany && primaryContact && (
        <Dato etiqueta={t('info.personaContacto')}>
          {primaryContact.position ? t('info.contactoConCargo', { nombre: primaryContact.name, cargo: primaryContact.position }) : primaryContact.name}
          {primaryContact.email && <span className="block text-fg-secondary">{primaryContact.email}</span>}
          {primaryContact.phone && <span className="block text-fg-secondary">{primaryContact.phone}</span>}
        </Dato>
      )}
      {nombreContacto && (
        <Dato etiqueta={t('info.personaContacto')}>{cargoPropio ? t('info.contactoConCargo', { nombre: nombreContacto, cargo: cargoPropio }) : nombreContacto}</Dato>
      )}
      <Dato etiqueta={t('info.correo')}>{clienteInfo.email || noEspecificado}</Dato>
      <Dato etiqueta={t('info.telefono')}>
        {clienteInfo.phone || noEspecificado}
        {otrosTelefonos.length > 0 && (
          <span className="block text-fg-secondary">
            {tImp('campos.telefonosAdicionales')}: {otrosTelefonos.join(' · ')}
          </span>
        )}
      </Dato>
      <Dato etiqueta={t('info.identificacion')}>
        {clienteInfo.identification_type
          ? t('info.identificacionValor', { tipo: clienteInfo.identification_type, numero: clienteInfo.identification_number || noEspecificado })
          : noEspecificado}
      </Dato>
    </Seccion>
  );

  const direccion = (
    <Seccion titulo={t('info.direccion')} descripcion={t('info.direccionDescripcion')} editar={editar}>
      <Dato etiqueta={t('info.direccionCompleta')}>{clienteInfo.address || noEspecificado}</Dato>
      <Dato etiqueta={tImp('campos.ciudad')}>{clienteInfo.city || noEspecificado}</Dato>
      <Dato etiqueta={t('info.municipio')}>{municipalityName || noEspecificado}</Dato>
      <Dato etiqueta={t('info.estadoProvincia')}>{departamento || noEspecificado}</Dato>
      <Dato etiqueta={t('info.codigoPostal')}>{municipalityPostalCode || noEspecificado}</Dato>
    </Seccion>
  );

  const rolesEtiquetas = (
    <Seccion titulo={t('info.rolesEtiquetas')} descripcion={t('info.rolesEtiquetasDescripcion')} editar={editar}>
      <Dato etiqueta={t('info.roles')}>{rolesFormatted}</Dato>
      <Dato etiqueta={t('info.etiquetas')}>
        {Array.isArray(clienteInfo.tags) && clienteInfo.tags.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {clienteInfo.tags.map((tag) => (
              <Badge key={tag} tono="neutro" apariencia="contorno" tamano="sm" className="bg-surface">
                {tag}
              </Badge>
            ))}
          </span>
        ) : (
          <span className="text-fg-secondary">{t('info.sinEtiquetas')}</span>
        )}
      </Dato>
      <Dato etiqueta={t('info.clienteRegistrado')}>{clienteInfo.is_registered ? t('info.si') : t('info.no')}</Dato>
    </Seccion>
  );

  // «Facturación electrónica» (Figma 06 Clientes 3192-19436) reemplaza a «Datos empresariales y
  // fiscales» con todos sus datos (razón social, nombre comercial, DV en el documento y
  // responsabilidades) y se muestra siempre: sin documento, su estado vacío explica que la factura
  // sale a «Consumidor final».
  const fiscales = (
    <TarjetaFacturacionCliente
      clienteId={clienteInfo.id}
      organizationId={organizationId}
      version={versionFacturacion}
      onCambio={() => setRecargaFicha((n) => n + 1)}
    />
  );

  const preferenciasContacto = (
    <Seccion titulo={t('info.preferenciasContacto')} descripcion={t('info.preferenciasDescripcion')} editar={editar} soloLectura={t('info.soloLectura')}>
      {preferencias.length > 0 ? (
        preferencias.map(([clave, valor]) => (
          <Dato key={clave} etiqueta={clave}>
            {valorPreferencia(valor)}
          </Dato>
        ))
      ) : (
        <Dato etiqueta={t('info.preferencias')}>
          <span className="text-fg-secondary">{t('info.sinPreferencias')}</span>
        </Dato>
      )}
      <Dato etiqueta={t('info.noLlamar')}>{clienteInfo.do_not_call ? t('info.si') : t('info.no')}</Dato>
      {clienteInfo.timezone && <Dato etiqueta={t('info.zonaHoraria')}>{clienteInfo.timezone}</Dato>}
      {isCompany && clienteInfo.company_size && <Dato etiqueta={t('info.tamanoEmpresa')}>{clienteInfo.company_size}</Dato>}
    </Seccion>
  );

  const sistema = (
    <Seccion titulo={t('info.datosSistema')} descripcion={t('info.datosSistemaDescripcion')} soloLectura={t('info.soloLectura')}>
      <Dato etiqueta={t('info.idCliente')}>
        <span className="break-all font-mono text-xs">{clienteInfo.id}</span>
      </Dato>
      <Dato etiqueta={t('info.idOrganizacion')}>{clienteInfo.organization_id}</Dato>
      <Dato etiqueta={t('info.fechaAlta')}>{createdAt}</Dato>
      <Dato etiqueta={t('info.ultimaActualizacion')}>{updatedAt}</Dato>
    </Seccion>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Pedido web con otro documento para la factura (Figma 3192-19702): usar, ligar o mantener. */}
      <AvisoRevisionFactura
        clienteId={clienteInfo.id}
        organizationId={organizationId}
        documentoFicha={etiquetaDocumento(clienteInfo)}
        esPersona={!isCompany}
        version={versionFacturacion}
        onRevisado={() => {
          setVersionFacturacion((n) => n + 1);
          setRecargaFicha((n) => n + 1);
        }}
      />
      {/* Figma 331:113517: dos columnas de tarjetas que se apilan en móvil. */}
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          {datosPrincipales}
          {direccion}
          {rolesEtiquetas}
        </div>
        <div className="flex flex-col gap-3">
          {fiscales}
          {preferenciasContacto}
          {sistema}
        </div>
      </div>

      {/* Empresas vinculadas: solo personas. */}
      {!isCompany && linkedCompanies.length > 0 && (
        <Seccion titulo={t('info.empresasVinculadas')} descripcion={t('info.empresasVinculadasDescripcion')} lista={false}>
          <ul className="flex flex-col gap-2">
            {linkedCompanies.map((company) => (
              <li key={company.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
                <span className="flex min-w-0 items-center gap-3">
                  <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
                    <Building2 className="size-4" strokeWidth={1.5} />
                  </span>
                  <span className="min-w-0">
                    <Link href={`/app/clientes/${company.id}`} className="block truncate text-sm font-medium text-link hover:underline">
                      {company.name ?? t('comun.sinNombre')}
                    </Link>
                    {company.position && <span className="block text-xs text-fg-secondary">{company.position}</span>}
                  </span>
                </span>
                {company.is_primary && (
                  <Badge tono="marca" tamano="sm">
                    {t('info.principal')}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {/* Datos del archivo de importación sin columna propia en la ficha */}
      {tieneDatosImportados(importacion, leadMeta) && (
        <Seccion titulo={tImp('titulo')} descripcion={tImp('descripcion')} lista={false}>
          <DatosImportadosLead importacion={importacion} lead={leadMeta} />
        </Seccion>
      )}

      <Seccion titulo={t('info.notas')} descripcion={t('info.notasDescripcion')} editar={editar} lista={false}>
        <p className={`whitespace-pre-wrap rounded-lg bg-subtle p-3 text-[13px] leading-[18px] ${clienteInfo.notes ? 'text-fg' : 'italic text-fg-secondary'}`}>
          {clienteInfo.notes || t('info.sinNotas')}
        </p>
      </Seccion>
    </div>
  );
}

/** Tarjeta de la pestaña (Figma 331:113517): título, descripción, «Solo lectura» y lápiz que lleva a editar. */
function Seccion({
  titulo,
  descripcion,
  editar,
  soloLectura,
  lista = true,
  children,
}: {
  titulo: string;
  descripcion?: string;
  editar?: string;
  soloLectura?: string;
  /** `false` si el contenido no son filas etiqueta / valor. */
  lista?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations('clientes.ficha');
  return (
    <section aria-label={titulo} className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-semibold leading-[19px] text-fg">{titulo}</h3>
          {descripcion && <p className="truncate text-[11px] leading-4 text-fg-muted">{descripcion}</p>}
        </div>
        {soloLectura && (
          <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-subtle px-2.5 text-xs font-medium text-fg-secondary">{soloLectura}</span>
        )}
        {editar && (
          <Link
            href={editar}
            aria-label={t('info.editarSeccion', { seccion: titulo })}
            title={t('info.editarSeccion', { seccion: titulo })}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </Link>
        )}
      </div>
      {lista ? <dl className="flex flex-col gap-2">{children}</dl> : <div className="flex flex-col gap-2">{children}</div>}
    </section>
  );
}

/** Fila etiqueta / valor: etiqueta atenuada a la izquierda, valor a la derecha (en móvil, uno bajo el otro). */
function Dato({ etiqueta, children }: { etiqueta: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-3">
      <dt className="text-[11px] leading-4 text-fg-muted sm:text-xs">{etiqueta}</dt>
      <dd className="min-w-0 break-words text-[13px] leading-[18px] text-fg">{children}</dd>
    </div>
  );
}
