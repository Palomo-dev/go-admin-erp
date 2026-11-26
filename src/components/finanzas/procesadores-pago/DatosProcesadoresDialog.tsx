'use client';

/**
 * «Datos de los procesadores» (Figma «07 Finanzas» 2706:150786): NIT y nombre de
 * cada procesador como tercero de su cuenta 138020xx, su origen (nacional o
 * exterior) y si retiene saldo a propósito. Decisiones del 2026-11-21:
 * - Wompi, Mercado Pago y PayU traen NIT de fábrica; dejar el campo vacío vuelve a él.
 * - Exterior: el IVA de la comisión queda pendiente (reverse charge), sin cambiar el
 *   formulario del abono.
 * - Retiene saldo: sin alerta de 5 días hábiles; alerta a los 30 días sin retiro.
 * Guarda solo los procesadores que cambiaron (`fn_procesador_pago_configurar`).
 *
 * «Tarifa», discreta bajo cada procesador, abre su diálogo de tarifa (comisión, IVA y
 * retenciones que estima el reporte «Recaudo por medio de pago»).
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Wallet } from 'lucide-react';
import { AvisoTonal, Dialogo, SegmentedControl } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toastSuccess } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import {
  TIPOS_DOCUMENTO_PROCESADOR,
  type DatosProcesador,
  type OrigenProcesador,
  type TipoDocumentoProcesador,
} from '@/lib/finanzas/procesadoresPago/procesadoresLogica';
import { TarifaProcesadorDialog } from './TarifaProcesadorDialog';

const NS = 'finanzasProcesadores';
export const RUTA_API_DATOS = '/api/finanzas/procesadores-pago/datos';

interface Fila {
  nit: string;
  nombre: string;
  /** Tipo de documento para la exógena; '' = sin elegir. */
  tipo: TipoDocumentoProcesador | '';
  origen: OrigenProcesador;
  retiene: boolean;
}

const inicial = (p: DatosProcesador): Fila => ({
  nit: p.nitPropio ?? '',
  nombre: p.nombrePropio ?? '',
  tipo: p.tipoDocumento ?? '',
  origen: p.origen,
  retiene: p.retieneSaldo,
});

/** Lo que cambió de una fila, en el formato de la API (solo las claves tocadas). */
export function cambiosDeFila(p: DatosProcesador, f: Fila): Record<string, unknown> | null {
  const base = inicial(p);
  const cambios: Record<string, unknown> = {};
  if (f.tipo !== base.tipo) cambios.tipo_documento = f.tipo || null;
  // 43 · sin número fiscal: la base asigna 444444001 y los siguientes (Contador 2026-11-21).
  if (f.tipo === '43') {
    if (base.tipo !== '43') cambios.nit = null;
  } else if (f.nit.trim() !== base.nit) cambios.nit = f.nit.trim() || null;
  if (f.nombre.trim() !== base.nombre) cambios.nombre = f.nombre.trim() || null;
  if (f.origen !== base.origen) cambios.origen = f.origen;
  if (f.retiene !== base.retiene) cambios.retiene_saldo = f.retiene;
  return Object.keys(cambios).length > 0 ? { procesador: p.codigo, ...cambios } : null;
}

export interface DatosProcesadoresDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  procesadores: readonly DatosProcesador[];
  puedeEditar: boolean;
  onGuardado: () => void;
}

export function DatosProcesadoresDialog({ abierto, onAbiertoChange, procesadores, puedeEditar, onGuardado }: DatosProcesadoresDialogProps) {
  const t = useTranslations(NS);
  const tRec = useTranslations('recaudoMedio.cobros');
  const [tarifaDe, setTarifaDe] = useState<DatosProcesador | null>(null);
  const [filas, setFilas] = useState<Record<string, Fila>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setFilas(Object.fromEntries(procesadores.map((p) => [p.codigo, inicial(p)])));
    setError(null);
  }, [abierto, procesadores]);

  const cambiar = (codigo: string, parcial: Partial<Fila>) => setFilas((f) => ({ ...f, [codigo]: { ...f[codigo], ...parcial } }));
  const pendientes = procesadores.map((p) => (filas[p.codigo] ? cambiosDeFila(p, filas[p.codigo]) : null)).filter((c): c is Record<string, unknown> => c !== null);

  const guardar = async () => {
    if (pendientes.length === 0) {
      onAbiertoChange(false);
      return;
    }
    setGuardando(true);
    setError(null);
    const org = getOrganizationId();
    try {
      for (const cuerpo of pendientes) {
        const r = await fetch(RUTA_API_DATOS, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', ...(org > 0 ? { 'x-organization-id': String(org) } : {}) },
          body: JSON.stringify(cuerpo),
        });
        if (!r.ok) {
          const { codigo } = (await r.json().catch(() => ({}))) as { codigo?: string };
          setError(t(`errores.${codigo && t.has(`errores.${codigo}`) ? codigo : 'DESCONOCIDO'}`));
          return;
        }
      }
      toastSuccess(t('datos.guardado'));
      onAbiertoChange(false);
      onGuardado();
    } catch {
      setError(t('errores.DESCONOCIDO'));
    } finally {
      setGuardando(false);
    }
  };

  const opcionesOrigen = [
    { valor: 'nacional' as const, etiqueta: t('origen.nacional') },
    { valor: 'exterior' as const, etiqueta: t('origen.exterior') },
  ];

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('datos.titulo')}
      descripcion={t('datos.descripcion')}
      icono={Wallet}
      ancho={880}
      primario={{
        etiqueta: t('acciones.guardar'),
        onClick: () => void guardar(),
        cargando: guardando,
        deshabilitada: !puedeEditar,
        motivo: puedeEditar ? undefined : t('datos.sinPermiso'),
      }}
      textoCancelar={t('acciones.cancelar')}
    >
      <div className="flex flex-col gap-4">
        <div role="table" aria-label={t('datos.titulo')} className="flex flex-col">
          <div role="row" className="hidden grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)_190px_96px] gap-3 border-b border-line bg-subtle px-2 py-2 text-xs font-medium text-fg-secondary md:grid">
            <span role="columnheader">{t('datos.columnas.procesador')}</span>
            <span role="columnheader">{t('datos.columnas.identificacion')}</span>
            <span role="columnheader">{t('datos.columnas.nombre')}</span>
            <span role="columnheader">{t('datos.columnas.origen')}</span>
            <span role="columnheader">{t('datos.columnas.retiene')}</span>
          </div>
          {procesadores.map((p) => {
            const f = filas[p.codigo];
            if (!f) return null;
            const sinNit = f.tipo !== '43' && !f.nit.trim() && !p.nitDeFabrica;
            // Del exterior sin tipo de documento: queda pendiente para la exógena (Contador 2026-11-21).
            const sinTipo = f.origen === 'exterior' && !f.tipo;
            const idNit = `nit-${p.codigo}`;
            return (
              <div
                role="row"
                key={p.codigo}
                className="grid grid-cols-1 gap-2 border-b border-line px-2 py-3 md:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)_190px_96px] md:items-center md:gap-3"
              >
                <div role="cell" className="flex flex-col">
                  <span className="text-sm font-medium text-fg">{p.etiqueta}</span>
                  <span className="text-xs text-fg-muted">{p.cuenta}</span>
                  <button
                    type="button"
                    className="self-start text-xs font-medium text-brand-deep underline-offset-2 hover:underline"
                    onClick={() => setTarifaDe(p)}
                    aria-label={`${tRec('configurarTarifa')} · ${p.etiqueta}`}
                  >
                    {tRec('configurarTarifa')}
                  </button>
                </div>
                <div role="cell" className="flex flex-col gap-1">
                  <Select
                    value={f.tipo || undefined}
                    onValueChange={(v) => cambiar(p.codigo, { tipo: v as TipoDocumentoProcesador })}
                    disabled={!puedeEditar}
                  >
                    <SelectTrigger
                      aria-label={t('datos.etiquetaTipo', { procesador: p.etiqueta })}
                      aria-invalid={sinTipo || undefined}
                      className={`h-9 border-line-strong bg-surface text-xs ${sinTipo ? 'border-line-danger' : ''}`}
                    >
                      <SelectValue placeholder={t('datos.tipoElegir')} />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_DOCUMENTO_PROCESADOR.map((tipo) => (
                        <SelectItem key={tipo} value={tipo}>
                          {t(`datos.tipos.${tipo}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    id={idNit}
                    aria-label={t('datos.etiquetaNit', { procesador: p.etiqueta })}
                    aria-invalid={sinNit || undefined}
                    aria-describedby={sinNit ? `${idNit}-error` : undefined}
                    value={f.tipo === '43' && (p.tipoDocumento !== '43' || !p.nitPropio) ? '' : f.nit}
                    placeholder={f.tipo === '43' ? t('datos.nitGenerico') : p.nitDeFabrica && p.nit ? p.nit : t('datos.nitEjemplo')}
                    maxLength={20}
                    disabled={!puedeEditar || f.tipo === '43'}
                    onChange={(e) => cambiar(p.codigo, { nit: e.target.value })}
                    className={`h-9 ${sinNit ? 'border-line-danger' : ''}`}
                  />
                  {p.nitDeFabrica && !f.nit.trim() && f.tipo !== '43' && <span className="text-xs text-fg-muted">{t('datos.deFabrica')}</span>}
                  {sinNit && (
                    <span id={`${idNit}-error`} className="text-xs text-danger-text">
                      {t('datos.faltaNit')}
                    </span>
                  )}
                  {sinTipo && !sinNit && <span className="text-xs text-danger-text">{t('datos.faltaTipo')}</span>}
                </div>
                <div role="cell">
                  <Input
                    aria-label={t('datos.etiquetaNombre', { procesador: p.etiqueta })}
                    value={f.nombre}
                    placeholder={p.nombre}
                    maxLength={120}
                    disabled={!puedeEditar}
                    onChange={(e) => cambiar(p.codigo, { nombre: e.target.value })}
                    className="h-9"
                  />
                </div>
                <div role="cell">
                  <SegmentedControl
                    opciones={opcionesOrigen}
                    valor={f.origen}
                    onValorChange={(v) => cambiar(p.codigo, { origen: v })}
                    etiqueta={t('datos.etiquetaOrigen', { procesador: p.etiqueta })}
                    tamano="sm"
                    deshabilitado={!puedeEditar}
                  />
                </div>
                <div role="cell" className="flex items-center gap-2">
                  <Switch
                    checked={f.retiene}
                    onCheckedChange={(v) => cambiar(p.codigo, { retiene: v })}
                    disabled={!puedeEditar}
                    aria-label={t('datos.etiquetaRetiene', { procesador: p.etiqueta })}
                  />
                  <span className="text-xs text-fg-secondary md:hidden">{t('datos.columnas.retiene')}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col items-start gap-2 rounded-lg border border-line-info bg-info-subtle px-4 py-3 text-xs text-info-text">
          <p>{t('datos.notaFabrica')}</p>
          <Badge tono="informacion" apariencia="suave" tamano="sm">
            {t('origen.exterior')}
          </Badge>
          <p>{t('datos.notaExterior')}</p>
          <Badge tono="informacion" apariencia="suave" tamano="sm">
            {t('datos.columnas.retieneLargo')}
          </Badge>
          <p>{t('datos.notaRetiene')}</p>
        </div>

        {error && <AvisoTonal tono="peligro" rol="alert" titulo={error} />}
      </div>

      {tarifaDe && (
        <TarifaProcesadorDialog
          abierto={!!tarifaDe}
          onAbiertoChange={(v) => !v && setTarifaDe(null)}
          procesador={tarifaDe.codigo}
          nombre={tarifaDe.etiqueta}
          tarifa={tarifaDe.tarifa ?? null}
          puedeEditar={puedeEditar}
          onGuardada={onGuardado}
        />
      )}
    </Dialogo>
  );
}
