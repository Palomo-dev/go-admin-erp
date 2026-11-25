'use client';

/**
 * Tarjeta «Facturación electrónica» de la pestaña Información (Figma «06 Clientes»: empresa
 * 3192-19438, persona con empresa ligada 3192-19702, vacía 3196-21482, cargando 3196-21511,
 * celular 3194-21369). Reemplaza a «Datos empresariales y fiscales» SIN quitar ninguno de sus datos
 * (razón social, nombre comercial, DV —va en el documento— y responsabilidades) y suma tipo de
 * persona, correo de factura, IVA 48/49 con su tributo, municipio DIAN y empresas ligadas.
 *
 * El lápiz abre «Editar datos de facturación» (decisión 5).
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Building2, ExternalLink, FileText, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { clasesBoton } from '@/components/kit/botonClases';
import { useEtiquetasCatalogo } from '@/components/clientes/new/useEtiquetasCatalogo';
import {
  estadoFacturacion,
  etiquetaDocumento,
  responsabilidadIvaDe,
  tributoDianCliente,
  type EstadoFacturacion,
} from '@/lib/clientes/facturacionElectronica';
import { mapTribute } from '@/lib/services/factusService';
import { cargarFacturacionCliente, catalogoResponsabilidades, type DatosFacturacionCliente } from '@/lib/clientes/facturacionClienteDatos';
import { EditarFacturacionDialog } from './EditarFacturacionDialog';

export interface TarjetaFacturacionClienteProps {
  clienteId: string;
  organizationId: number;
  /** Cambia cuando otra pieza de la ficha modificó los datos (p. ej. «Usar este» de un pedido). */
  version?: number;
  /** Se llama tras guardar desde el diálogo. */
  onCambio?: () => void;
}

const TONO_ESTADO: Record<Exclude<EstadoFacturacion, 'vacia'>, 'exito' | 'advertencia'> = {
  completa: 'exito',
  faltaCorreo: 'advertencia',
  incompleta: 'advertencia',
};

export function TarjetaFacturacionCliente({ clienteId, organizationId, version = 0, onCambio }: TarjetaFacturacionClienteProps) {
  const t = useTranslations('clientesFacturacion');
  const etiquetas = useEtiquetasCatalogo();
  const [datos, setDatos] = useState<DatosFacturacionCliente | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [catalogo, setCatalogo] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    void catalogoResponsabilidades().then((lista) => {
      if (vivo) setCatalogo(Object.fromEntries(lista.map((r) => [r.code, r.description])));
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(false);
    cargarFacturacionCliente(organizationId, clienteId)
      .then((d) => {
        if (vivo) setDatos(d);
      })
      .catch(() => {
        if (vivo) setError(true);
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [organizationId, clienteId, version, recarga]);

  const guardado = useCallback(() => {
    setRecarga((n) => n + 1);
    onCambio?.();
  }, [onCambio]);

  const titulo = t('tarjeta.titulo');
  const cabecera = (estado: EstadoFacturacion | null, conLapiz: boolean) => (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <h3 className="text-[13px] font-semibold leading-[19px] text-fg">{titulo}</h3>
        <p className="truncate text-[11px] leading-4 text-fg-muted">{t('tarjeta.descripcion')}</p>
      </div>
      {estado && estado !== 'vacia' && (
        <Badge tono={TONO_ESTADO[estado]} tamano="sm">
          {t(`estado.${estado}`)}
        </Badge>
      )}
      {conLapiz && (
        <button
          type="button"
          onClick={() => setEditando(true)}
          aria-label={t('tarjeta.editar')}
          title={t('tarjeta.editar')}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
      )}
    </div>
  );

  if (cargando && !datos) {
    return (
      <section aria-label={titulo} aria-busy="true" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3">
        {cabecera(null, false)}
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-full" />
          </div>
        ))}
        <span className="sr-only">{t('tarjeta.cargando')}</span>
      </section>
    );
  }

  if (error || !datos) {
    return (
      <section aria-label={titulo} className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3">
        {cabecera(null, false)}
        <p role="alert" className="text-[13px] text-danger-text">
          {t('tarjeta.error')}
        </p>
      </section>
    );
  }

  const f = datos.ficha;
  const empresa = f.customer_type === 'company';
  const estado = estadoFacturacion(f);
  const dialogo = <EditarFacturacionDialog abierto={editando} onAbiertoChange={setEditando} organizationId={organizationId} datos={datos} onGuardado={guardado} />;

  if (estado === 'vacia') {
    return (
      <section aria-label={titulo} className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3">
        {cabecera(estado, false)}
        <div className="flex flex-col items-center gap-2 px-2 py-3 text-center">
          <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-brand-tint text-brand">
            <FileText className="size-5" strokeWidth={1.5} />
          </span>
          <p className="text-sm font-semibold text-fg">{t('vacia.titulo')}</p>
          <p className="text-[13px] leading-[18px] text-fg-secondary">{t('vacia.texto')}</p>
          <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'sm' })} onClick={() => setEditando(true)}>
            {t('vacia.agregar')}
          </button>
        </div>
        {dialogo}
      </section>
    );
  }

  const iva = responsabilidadIvaDe(f.fiscal_responsibilities);
  // El mismo cálculo que el payload de Factus: el RUT (48/49) manda; si no, el tributo de la ficha.
  const tributo = tributoDianCliente(f.fiscal_responsibilities) ?? mapTribute(f.tribute_id ?? null);
  const responsabilidades = f.fiscal_responsibilities ?? [];
  const nombrePersona = `${f.first_name ?? ''} ${f.last_name ?? ''}`.trim() || f.full_name || '';
  const municipio = datos.municipio;
  const principal = datos.empresas[0] ?? null;
  const otras = Math.max(0, datos.empresas.length - 1);
  const noEspecificado = t('tarjeta.noEspecificado');

  return (
    <section aria-label={titulo} className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3">
      {cabecera(estado, true)}
      <dl className="flex flex-col gap-2">
        <Dato etiqueta={t('tarjeta.tipoPersona')}>{empresa ? t('tarjeta.juridica') : t('tarjeta.natural')}</Dato>
        <Dato etiqueta={t('tarjeta.documento')}>{etiquetaDocumento(f) || noEspecificado}</Dato>
        {empresa ? (
          <Dato etiqueta={t('tarjeta.razonSocial')}>{f.company_name || f.full_name || noEspecificado}</Dato>
        ) : (
          <Dato etiqueta={t('tarjeta.nombreFactura')}>{nombrePersona || noEspecificado}</Dato>
        )}
        {/* «Datos empresariales y fiscales» mostraba razón social y nombre comercial también en personas. */}
        {!empresa && f.company_name && <Dato etiqueta={t('tarjeta.razonSocial')}>{f.company_name}</Dato>}
        {(empresa || f.trade_name) && <Dato etiqueta={t('tarjeta.nombreComercial')}>{f.trade_name || noEspecificado}</Dato>}
        <Dato etiqueta={t('tarjeta.correoFactura')}>
          {f.billing_email ? (
            <>
              <span className="break-all">{f.billing_email}</span>
              {f.email && f.email.toLowerCase() !== f.billing_email.toLowerCase() && (
                <span className="block text-[11px] leading-4 text-fg-muted">{t('tarjeta.distintoContacto', { correo: f.email })}</span>
              )}
            </>
          ) : (
            <>
              <span className="text-fg-muted">{t('tarjeta.sinCorreo')}</span>
              <span className="mt-1 block rounded-lg border border-line-warning bg-warning-subtle px-2.5 py-1.5 text-xs text-warning-text">
                {f.email ? (
                  <>
                    <span className="block font-medium">{t('tarjeta.iraContacto')}</span>
                    <span className="block break-all">{f.email}</span>
                  </>
                ) : (
                  <span className="block font-medium">{t('tarjeta.sinNingunCorreo')}</span>
                )}
              </span>
              <button type="button" className="mt-1 text-[13px] font-medium text-link hover:underline" onClick={() => setEditando(true)}>
                {t('tarjeta.agregarCorreo')}
              </button>
            </>
          )}
        </Dato>
        <Dato etiqueta={t('iva.pregunta')}>
          {iva ? (
            <span className="inline-flex items-center gap-1.5">
              {iva === '48' ? t('iva.si') : t('iva.no')}
              <span className="rounded-md bg-subtle px-1.5 py-0.5 font-mono text-xs text-fg-secondary">{iva}</span>
            </span>
          ) : (
            <span className="text-fg-muted">{t('iva.sinDefinir')}</span>
          )}
        </Dato>
        <Dato etiqueta={t('tarjeta.tributo')}>
          {tributo === '01' ? t('tarjeta.tributoIva') : tributo === 'ZZ' ? t('tarjeta.tributoNoAplica') : tributo}
        </Dato>
        <Dato etiqueta={t('tarjeta.responsabilidades')}>
          {responsabilidades.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {responsabilidades.map((codigo) => (
                <Badge key={codigo} tono="neutro" apariencia="contorno" tamano="sm" className="bg-surface">
                  {catalogo[codigo] ? `${codigo} ${etiquetas.fiscal(codigo, catalogo[codigo])}` : codigo}
                </Badge>
              ))}
            </span>
          ) : (
            noEspecificado
          )}
        </Dato>
        <Dato etiqueta={t('tarjeta.municipio')}>
          {municipio ? [municipio.nombre, municipio.codigo, municipio.departamento].filter(Boolean).join(' · ') : noEspecificado}
        </Dato>
      </dl>

      {empresa && datos.personasLigadas > 0 && (
        <p className="border-t border-line pt-2 text-[11px] leading-4 text-fg-muted">{t('tarjeta.personasLigadas', { n: datos.personasLigadas })}</p>
      )}

      {!empresa && principal && (
        <div className="flex flex-col gap-1.5 border-t border-line pt-2">
          <p className="text-[11px] leading-4 text-fg-muted">{t('tarjeta.facturaTambien')}</p>
          <div className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-secondary">
              <Building2 className="size-4" strokeWidth={1.5} />
            </span>
            <span className="min-w-0 flex-1">
              <Link href={`/app/clientes/${encodeURIComponent(principal.id)}`} className="block truncate text-sm font-medium text-link hover:underline">
                {principal.nombre || t('sinNombre')}
              </Link>
              <span className="block truncate text-[11px] text-fg-muted">
                {[etiquetaDocumento(principal), principal.cargo ? t('tarjeta.contactoDe', { cargo: principal.cargo }) : null].filter(Boolean).join(' · ')}
              </span>
              {otras > 0 && <span className="block text-[11px] font-medium text-fg-secondary">{t('tarjeta.masEmpresas', { n: otras })}</span>}
            </span>
            <Link href={`/app/clientes/${encodeURIComponent(principal.id)}`} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} aria-label={t('tarjeta.verFichaDe', { nombre: principal.nombre })}>
              <ExternalLink className="size-4" aria-hidden="true" />
              <span className="max-sm:sr-only">{t('tarjeta.verFicha')}</span>
            </Link>
          </div>
          <p className="text-[11px] leading-4 text-fg-muted">{t('tarjeta.facturaConNit')}</p>
        </div>
      )}
      {dialogo}
    </section>
  );
}

/** Fila etiqueta / valor, como las demás tarjetas de la pestaña Información. */
function Dato({ etiqueta, children }: { etiqueta: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-3">
      <dt className="text-[11px] leading-4 text-fg-muted sm:text-xs">{etiqueta}</dt>
      <dd className="min-w-0 break-words text-[13px] leading-[18px] text-fg">{children}</dd>
    </div>
  );
}
