'use client';

/**
 * «Facturar a» (Figma «06 Clientes» 3201-21438; componentes «Facturar a / Opción» 3201-21457 y
 * «Facturar a / Empresa ligada» 3201-21501). Una sola pieza para el cobro del POS (computador y
 * celular) y la factura de venta manual.
 *
 * Cambio del dueño sobre el diseño (2026-11-25): NO bloquea. Arranca en «Persona» (o «Consumidor
 * final» si la ficha no tiene documento); si la persona tiene empresas ligadas se ve el aviso
 * «¿la factura va a una de ellas?» con la lista para escoger con un toque. «La última vez: …» es
 * solo sugerencia: nunca se marca sola. La regla vive en `@/lib/clientes/facturarA`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, Info, Loader2, Plus, ReceiptText, User, Users } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { etiquetaDocumento } from '@/lib/clientes/facturacionElectronica';
import { cargarFacturacionCliente, ultimaEmpresaFacturada, type DatosFacturacionCliente } from '@/lib/clientes/facturacionClienteDatos';
import {
  facturarAInicial,
  ivaDeEmpresa,
  normalizarFacturarA,
  sugerenciaUltimaVez,
  type EmpresaFacturable,
  type FacturarA,
  type ModoFacturarA,
  type SeleccionFacturarA,
} from '@/lib/clientes/facturarA';
import { EditarFacturacionDialog, datosEmpresaNueva } from './EditarFacturacionDialog';

export interface FacturarASelectorProps {
  organizationId: number;
  /** La persona del carrito / del documento. */
  personaId: string;
  valor: FacturarA | null;
  onCambio: (seleccion: SeleccionFacturarA) => void;
  /** `pos`: cobro (opciones en fila). `documento`: columna angosta de la factura manual. */
  variante?: 'pos' | 'documento';
  /** Etiqueta de la persona arriba a la derecha: «Cliente del carrito» (POS) o «Cliente» (factura). */
  className?: string;
}

interface Persona {
  nombre: string;
  documento: string;
  tieneDocumento: boolean;
}

function empresasFacturables(datos: DatosFacturacionCliente): EmpresaFacturable[] {
  return datos.empresas.map((e) => ({
    id: e.id,
    nombre: e.nombre,
    documento: etiquetaDocumento(e),
    iva: ivaDeEmpresa(e.fiscal_responsibilities),
    correoFactura: (e.billing_email || e.email || '').trim() || null,
    cargo: e.cargo,
    principal: e.principal,
  }));
}

export function FacturarASelector({ organizationId, personaId, valor, onCambio, variante = 'pos', className }: FacturarASelectorProps) {
  const t = useTranslations('clientesFacturarA');
  const [cargando, setCargando] = useState(true);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [empresas, setEmpresas] = useState<EmpresaFacturable[]>([]);
  const [ultimaId, setUltimaId] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [nuevaEmpresa, setNuevaEmpresa] = useState(() => datosEmpresaNueva(organizationId));
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // Datos de la persona y sus empresas ligadas (RLS por pertenencia, como la ficha).
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    void Promise.all([cargarFacturacionCliente(organizationId, personaId), ultimaEmpresaFacturada(organizationId, personaId).catch(() => null)])
      .then(([datos, ultima]) => {
        if (!vivo) return;
        if (!datos) {
          setPersona(null);
          setEmpresas([]);
          return;
        }
        const f = datos.ficha;
        setPersona({
          nombre: (f.full_name || f.company_name || `${f.first_name ?? ''} ${f.last_name ?? ''}`).trim(),
          documento: etiquetaDocumento(f),
          tieneDocumento: !!(f.identification_number ?? '').trim(),
        });
        setEmpresas(empresasFacturables(datos));
        setUltimaId(ultima);
      })
      .catch(() => {
        if (vivo) {
          setPersona(null);
          setEmpresas([]);
        }
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [organizationId, personaId, version]);

  const tieneDocumento = persona?.tieneDocumento ?? false;
  const actual = useMemo<FacturarA>(() => normalizarFacturarA(valor ?? facturarAInicial(tieneDocumento), empresas, tieneDocumento), [valor, empresas, tieneDocumento]);

  const emitir = useCallback(
    (v: FacturarA) => {
      onCambio({ valor: v, personaTieneDocumento: tieneDocumento, empresa: v.modo === 'empresa' ? empresas.find((e) => e.id === v.empresaId) ?? null : null });
    },
    [onCambio, tieneDocumento, empresas],
  );

  // Al cargar, el padre recibe el punto de partida (o la elección que traía, ya validada) junto con
  // si la persona tiene documento: sin eso no sabe qué adquiriente mandar.
  useEffect(() => {
    if (cargando || !persona) return;
    if (pendiente && empresas.some((e) => e.id === pendiente)) {
      setPendiente(null);
      emitir({ modo: 'empresa', empresaId: pendiente });
      return;
    }
    emitir(actual);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando, persona, empresas, pendiente]);

  if (cargando) {
    return (
      <div className={cn('flex items-center gap-2 rounded-xl border border-line bg-surface p-4 text-sm text-fg-secondary', className)} aria-busy="true">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {t('cargando')}
      </div>
    );
  }
  if (!persona) return null;

  const ultima = sugerenciaUltimaVez(empresas, ultimaId);
  const escogida = actual.modo === 'empresa' ? empresas.find((e) => e.id === actual.empresaId) ?? null : null;
  const documento = variante === 'documento';

  const escoger = (modo: ModoFacturarA) => {
    if (modo === 'empresa') {
      // Con una sola empresa, un toque la escoge; con varias, se escoge en la lista.
      if (empresas.length === 1) emitir({ modo: 'empresa', empresaId: empresas[0].id });
      else document.getElementById(`facturar-a-empresas-${personaId}`)?.focus();
      return;
    }
    emitir({ modo, empresaId: null });
  };

  const abrirAgregar = () => {
    setNuevaEmpresa(datosEmpresaNueva(organizationId));
    setAgregando(true);
  };

  const dialogo = (
    <EditarFacturacionDialog
      abierto={agregando}
      onAbiertoChange={setAgregando}
      organizationId={organizationId}
      datos={nuevaEmpresa}
      nuevaEmpresaDe={{ personaId, personaNombre: persona.nombre }}
      onEmpresaLista={(id) => setPendiente(id)}
      onGuardado={() => setVersion((v) => v + 1)}
    />
  );

  // Sin empresas ligadas: una línea con la persona y «Agregar empresa con NIT» (no estorba el cobro).
  if (empresas.length === 0) {
    return (
      <div className={cn('flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm', className)}>
        <span className="flex min-w-0 items-center gap-2 text-fg">
          <ReceiptText className="size-4 shrink-0 text-fg-secondary" aria-hidden="true" />
          <span className="font-medium">{t('titulo')}:</span>
          <span className="truncate">{tieneDocumento ? `${persona.nombre}${persona.documento ? ` · ${persona.documento}` : ''}` : t('opciones.consumidorFinal')}</span>
        </span>
        <button type="button" onClick={abrirAgregar} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-brand-deep hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <Plus className="size-4" aria-hidden="true" />
          {t('agregarEmpresa')}
        </button>
        {dialogo}
      </div>
    );
  }

  const opciones: Array<{ modo: ModoFacturarA; titulo: string; sub: string; icono: typeof User; deshabilitada?: boolean }> = [
    { modo: 'consumidor_final', titulo: t('opciones.consumidorFinal'), sub: t('opciones.consumidorFinalSub'), icono: Users },
    { modo: 'persona', titulo: t(documento ? 'opciones.personaCorta' : 'opciones.persona'), sub: persona.documento || t('opciones.personaSinDocumento'), icono: User, deshabilitada: !tieneDocumento },
    { modo: 'empresa', titulo: t(documento ? 'opciones.empresaCorta' : 'opciones.empresa'), sub: t('opciones.empresaSub', { n: empresas.length }), icono: Building2 },
  ];

  return (
    <section className={cn('flex flex-col gap-3 rounded-xl border border-line bg-surface p-4', className)} aria-labelledby={`facturar-a-${personaId}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={`facturar-a-${personaId}`} className="flex items-center gap-2 text-[15px] font-semibold text-fg">
          <ReceiptText className="size-4 text-fg-secondary" aria-hidden="true" />
          {t('titulo')}
        </h3>
        {!documento && <span className="text-xs text-fg-muted">{t('clienteCarrito', { nombre: persona.nombre })}</span>}
      </header>

      {/* Cambio del dueño: aviso visible en vez de bloquear. */}
      <div role="note" className="flex items-start gap-2 rounded-lg border border-line-info bg-info-subtle px-3 py-2 text-[13px] text-info-text">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{t('aviso')}</span>
          <span className="text-xs">{t('avisoAyuda', { persona: tieneDocumento ? persona.nombre : t('opciones.consumidorFinal') })}</span>
        </div>
      </div>

      <div role="radiogroup" aria-label={t('titulo')} className={cn('grid gap-2', documento ? 'grid-cols-3' : 'grid-cols-3 max-sm:grid-cols-1')}>
        {opciones.map((o) => {
          const marcada = actual.modo === o.modo;
          const Icono = o.icono;
          return (
            <button
              key={o.modo}
              type="button"
              role="radio"
              aria-checked={marcada}
              disabled={o.deshabilitada}
              onClick={() => escoger(o.modo)}
              className={cn(
                'flex min-h-[56px] gap-2 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50',
                documento ? 'flex-col items-center justify-center text-center' : 'items-center',
                marcada ? 'border-brand-action bg-brand-tint text-brand-deep' : 'border-line-strong bg-surface text-fg hover:bg-hover',
              )}
            >
              <Icono className="size-5 shrink-0" aria-hidden="true" />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-semibold leading-tight">{o.titulo}</span>
                <span className={cn('truncate text-xs', marcada ? 'text-brand-deep/80' : 'text-fg-muted')}>{o.sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-fg">
          <span className="font-medium">{t('empresasDe', { persona: persona.nombre })}</span>
          <span className="text-xs text-fg-muted">· {escogida ? t('escogida') : t('ningunaMarcada')}</span>
          {ultima && !escogida && (
            <button type="button" onClick={() => emitir({ modo: 'empresa', empresaId: ultima.id })} className="text-xs font-medium text-brand-deep underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              {t('ultimaVez', { empresa: ultima.nombre || t('sinNombre') })}
            </button>
          )}
        </p>
        <div id={`facturar-a-empresas-${personaId}`} tabIndex={-1} role="radiogroup" aria-label={t('empresasDe', { persona: persona.nombre })} className="flex flex-col gap-2 focus-visible:outline-none">
          {empresas.map((e) => {
            const marcada = escogida?.id === e.id;
            return (
              <button
                key={e.id}
                type="button"
                role="radio"
                aria-checked={marcada}
                onClick={() => emitir(marcada ? facturarAInicial(tieneDocumento) : { modo: 'empresa', empresaId: e.id })}
                className={cn(
                  'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  marcada ? 'border-brand-action bg-brand-tint' : 'border-line bg-surface hover:bg-hover',
                )}
              >
                <span aria-hidden="true" className={cn('flex size-4 shrink-0 items-center justify-center rounded-full border-2', marcada ? 'border-brand-action' : 'border-line-strong')}>
                  {marcada && <span className="size-2 rounded-full bg-brand-action" />}
                </span>
                <Building2 className="size-4 shrink-0 text-fg-secondary" aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn('truncate text-sm font-semibold', marcada ? 'text-brand-deep' : 'text-fg')}>{e.nombre || t('sinNombre')}</span>
                  <span className="truncate text-xs text-fg-muted">
                    {[e.documento, !documento ? e.cargo : null, !documento && e.principal ? t('principal') : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                    e.iva === '48' ? 'border-line-success bg-success-subtle text-success-text' : 'border-line bg-subtle text-fg-secondary',
                  )}
                >
                  {e.iva ? t(documento ? `ivaCorto` : `iva.${e.iva}`, { codigo: e.iva }) : t('iva.sin')}
                </span>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={abrirAgregar} className="inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <Plus className="size-4" aria-hidden="true" />
          {t('agregarEmpresa')}
        </button>
      </div>

      {escogida && (
        <dl className={cn('grid gap-3 rounded-lg bg-subtle p-3 text-xs text-fg-secondary', documento ? 'grid-cols-1' : 'grid-cols-2 max-sm:grid-cols-1')}>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">{t('resumen.adquiriente')}</dt>
            <dd className="text-sm font-semibold text-fg">{escogida.nombre || t('sinNombre')}</dd>
            <dd>{[escogida.documento, escogida.iva ? t(`iva.${escogida.iva}`) : null].filter(Boolean).join(' · ')}</dd>
            <dd>{escogida.correoFactura ? t('resumen.correo', { correo: escogida.correoFactura }) : t('resumen.sinCorreo')}</dd>
            <dd>{t('resumen.cartera')}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">{t('resumen.recibe')}</dt>
            <dd className="text-sm font-semibold text-fg">{persona.nombre}</dd>
            <dd>{[persona.documento, escogida.cargo].filter(Boolean).join(' · ')}</dd>
            <dd>{t('resumen.noAdquiriente')}</dd>
          </div>
        </dl>
      )}
      {dialogo}
    </section>
  );
}
