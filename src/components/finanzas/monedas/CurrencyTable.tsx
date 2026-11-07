'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CalendarPlus, Coins, History, Landmark, RefreshCw, Trash2, Hand } from 'lucide-react';
import { ConfirmDialog, DataTable, ListCard, StatusBadge, type AccionFila, type ColumnaTabla } from '@/components/kit';
import { cambiarTasaAutomatica, quitarMonedaOrganizacion, type MonedaOrganizacion } from '@/lib/services/monedasTasasService';
import DialogoMonedaBase from './CurrencyPreferences';
import { mensajeErrorMoneda } from './erroresMonedas';

export interface PestanaMonedasProps {
  organizationId: number;
  monedas: readonly MonedaOrganizacion[];
  estado: 'cargando' | 'listo' | 'error';
  base: string;
  onRecargar: () => void;
  onAgregar: () => void;
  onRegistrarTasa: (codigo: string) => void;
  onVerHistorial: (codigo: string) => void;
}

/**
 * Pestaña «Monedas»: las monedas de la organización. Conserva las acciones de
 * la pantalla anterior (establecer base, tasa automática sí/no, quitar) y
 * suma registrar tasa y ver historial. Quitar ahora confirma con
 * `ConfirmDialog` (antes `confirm()`); la base no se puede quitar.
 */
export default function PestanaMonedas({
  organizationId,
  monedas,
  estado,
  base,
  onRecargar,
  onAgregar,
  onRegistrarTasa,
  onVerHistorial,
}: PestanaMonedasProps) {
  const t = useTranslations('finanzasMonedasR2.monedas');
  const tComun = useTranslations('finanzasMonedasR2.comun');
  const tSeg = useTranslations('monedasSeguridad');
  const [aQuitar, setAQuitar] = useState<MonedaOrganizacion | null>(null);
  const [quitando, setQuitando] = useState(false);
  const [nuevaBase, setNuevaBase] = useState<string | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);

  async function alternarTasa(m: MonedaOrganizacion) {
    setCambiando(m.code);
    try {
      await cambiarTasaAutomatica(organizationId, m.code, !m.automatica);
      toast.success(!m.automatica ? t('tasaAhoraAutomatica', { moneda: m.code }) : t('tasaAhoraManual', { moneda: m.code }));
      onRecargar();
    } catch (error) {
      toast.error(t('errorTasa', { detalle: mensajeErrorMoneda(error, tSeg) }));
    } finally {
      setCambiando(null);
    }
  }

  async function quitar() {
    if (!aQuitar) return;
    setQuitando(true);
    try {
      await quitarMonedaOrganizacion(organizationId, aQuitar.code);
      toast.success(t('quitada', { moneda: aQuitar.code }));
      setAQuitar(null);
      onRecargar();
    } catch (error) {
      toast.error(t('errorQuitar', { detalle: mensajeErrorMoneda(error, tSeg) }));
    } finally {
      setQuitando(false);
    }
  }

  const acciones = (m: MonedaOrganizacion): AccionFila[] => [
    { id: 'tasa', etiqueta: t('acciones.registrarTasa'), icono: CalendarPlus, onSelect: () => onRegistrarTasa(m.code), oculta: m.is_base },
    { id: 'historial', etiqueta: t('acciones.historial'), icono: History, onSelect: () => onVerHistorial(m.code), oculta: m.is_base },
    {
      id: 'modo',
      etiqueta: m.automatica ? t('acciones.pasarAManual') : t('acciones.pasarAAutomatica'),
      icono: m.automatica ? Hand : RefreshCw,
      onSelect: () => alternarTasa(m),
      oculta: m.is_base,
      deshabilitada: cambiando === m.code,
      motivo: cambiando === m.code ? tComun('guardando') : undefined,
    },
    { id: 'base', etiqueta: t('acciones.usarComoBase'), icono: Landmark, onSelect: () => setNuevaBase(m.code), oculta: m.is_base, separadorAntes: true },
    {
      id: 'quitar',
      etiqueta: t('acciones.quitar'),
      icono: Trash2,
      onSelect: () => setAQuitar(m),
      destructiva: true,
      deshabilitada: m.is_base,
      motivo: m.is_base ? tSeg('monedaBaseNoSeElimina') : undefined,
    },
  ];

  const textoTasa = (m: MonedaOrganizacion) => (m.is_base ? t('tasaBase') : m.automatica ? tComun('automatica') : tComun('manual'));

  const columnas: ColumnaTabla<MonedaOrganizacion>[] = [
    {
      id: 'moneda',
      encabezado: t('columnas.moneda'),
      celda: (m) => (
        <span className="flex items-center gap-2">
          <span className="font-medium text-fg">{m.name}</span>
          {m.is_base && <StatusBadge estado="base" etiqueta={t('base')} tono="marca" tamano="sm" />}
        </span>
      ),
    },
    { id: 'codigo', encabezado: t('columnas.codigo'), variante: 'mono', celda: (m) => m.code },
    { id: 'simbolo', encabezado: t('columnas.simbolo'), celda: (m) => m.symbol },
    { id: 'decimales', encabezado: t('columnas.decimales'), alinear: 'derecha', ocultarDebajo: 'md', celda: (m) => m.decimals },
    { id: 'tasa', encabezado: t('columnas.tasa'), celda: (m) => <span className="text-fg-secondary">{textoTasa(m)}</span> },
  ];

  return (
    <>
      <DataTable
        etiqueta={t('etiqueta')}
        columnas={columnas}
        filas={monedas}
        obtenerId={(m) => m.code}
        etiquetaFila={(m) => `${m.code} · ${m.name}`}
        estado={estado === 'cargando' ? 'cargando' : estado === 'error' ? 'error' : 'listo'}
        acciones={acciones}
        onReintentar={onRecargar}
        filasEsqueleto={3}
        vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion'), icono: Coins, accion: { etiqueta: t('agregar'), onClick: onAgregar } }}
        error={{ titulo: t('errorCarga') }}
        tarjetaMovil={(m) => (
          <ListCard
            icono={Coins}
            titulo={`${m.code} · ${m.name}`}
            insignia={m.is_base ? <StatusBadge estado="base" etiqueta={t('base')} tono="marca" tamano="sm" /> : undefined}
            subtitulo={t('tarjeta', { simbolo: m.symbol, decimales: m.decimals })}
            meta={textoTasa(m)}
            acciones={acciones(m)}
          />
        )}
      />

      <ConfirmDialog
        abierto={!!aQuitar}
        onAbiertoChange={(v) => !v && setAQuitar(null)}
        titulo={t('quitarTitulo', { moneda: aQuitar?.code ?? '' })}
        descripcion={t('quitarDescripcion', { moneda: aQuitar?.name ?? '' })}
        textoConfirmar={t('quitarConfirmar')}
        tono="peligro"
        icono={Trash2}
        cargando={quitando}
        onConfirmar={quitar}
      />

      <DialogoMonedaBase
        abierto={!!nuevaBase}
        onAbiertoChange={(v) => !v && setNuevaBase(null)}
        organizationId={organizationId}
        actual={base}
        nueva={nuevaBase}
        onCambiada={onRecargar}
      />
    </>
  );
}
