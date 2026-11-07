'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Coins } from 'lucide-react';
import { AvisoTonal, CampoFecha, DataTable, FormField, type ColumnaTabla } from '@/components/kit';
// GO-sec (2026-09-28): la sincronización la hace el servidor (plataforma) con
// una clave de servidor; el navegador ya no llama a OpenExchangeRates.
import { sincronizarTasasDeCambio } from '@/lib/services/tasasCambioCliente';
import { addPlainDays } from '@/lib/utils/timezone';
import { serieTasas, tasaVigente, HOLGURA_DIAS, type TasaVigente } from '@/lib/finanzas/monedas/tasasLogica';
import type { MonedaOrganizacion } from '@/lib/services/monedasTasasService';
import { useTasasOrganizacion } from './useTasasOrganizacion';
import { useFormatoTasas } from './useFormatoTasas';
import { useSincronizarCatalogo, Variacion } from './piezasTasas';

// ============================================================
// M1 · Tasas (captura 82-finanzas-r2-13) y M5 · versión móvil (17).
// Lee el catálogo GLOBAL `currency_rates` y las tasas manuales de la
// organización (`exchange_rates`). ADR-004: el día del catálogo es el del
// sistema al escribir, pero se LEE con el día de la organización: la fecha
// por defecto es `hoy` en su zona (useFormatDate().getToday()).
// ============================================================

export interface PestanaTasasProps {
  organizationId: number;
  base: string;
  monedas: readonly MonedaOrganizacion[];
  hoy: string;
  /** Sube cuando se registra una tasa: vuelve a leer. */
  version: number;
  onRegistrar: (codigo: string, fecha: string) => void;
  onVerHistorial: (codigo: string) => void;
  onAgregarMoneda: () => void;
}

interface FilaTasa {
  moneda: MonedaOrganizacion;
  vigente: TasaVigente;
}

export default function PestanaTasas({
  organizationId,
  base,
  monedas,
  hoy,
  version,
  onRegistrar,
  onVerHistorial,
  onAgregarMoneda,
}: PestanaTasasProps) {
  const t = useTranslations('finanzasMonedasR2.tasas');
  const tComun = useTranslations('finanzasMonedasR2.comun');
  const formato = useFormatoTasas(base);
  const [fecha, setFecha] = useState(hoy);
  const dia = fecha || hoy;

  const otras = useMemo(() => monedas.filter((m) => !m.is_base), [monedas]);
  const codigos = useMemo(() => (otras.length ? [base, ...otras.map((m) => m.code)] : []), [otras, base]);
  const datos = useTasasOrganizacion(organizationId, codigos, addPlainDays(dia, -HOLGURA_DIAS), dia, version);
  const { sincronizando, sincronizarCatalogo } = useSincronizarCatalogo(sincronizarTasasDeCambio, datos.recargar);

  const filas = useMemo<FilaTasa[]>(
    () =>
      otras.map((moneda) => ({
        moneda,
        vigente: tasaVigente(serieTasas({ moneda: moneda.code, base, catalogo: datos.catalogo, manuales: datos.manuales }), dia),
      })),
    [otras, base, datos.catalogo, datos.manuales, dia],
  );

  const esHoy = dia === hoy ? 'si' : 'no';
  const catalogoDelDia = datos.catalogo.get(dia);
  const horaCatalogo = catalogoDelDia ? formato.hora([...catalogoDelDia.values()][0]?.created_at) : '';
  const sinNada = datos.estado === 'listo' && datos.catalogo.size === 0 && filas.every((f) => !f.vigente.punto);

  const autor = (id: string | null) => (id ? datos.autores.get(id) ?? tComun('alguien') : tComun('alguien'));

  /** Texto de la columna «Fuente». */
  const fuente = ({ vigente }: FilaTasa): string => {
    const p = vigente.punto;
    if (!p) return t('sinTasa');
    if (!vigente.delDia) {
      return p.dia === addPlainDays(dia, -1)
        ? t('usaAyer', { tasa: formato.tasa(p.tasa) })
        : t('usaDel', { dia: formato.dia(p.dia), tasa: formato.tasa(p.tasa) });
    }
    if (p.fuente === 'automatica') return t('catalogo');
    return p.motivo ? t('manualCon', { autor: autor(p.autorId), motivo: p.motivo }) : t('manualDe', { autor: autor(p.autorId) });
  };

  /** Móvil: «Manual · Ana Gómez» o «Automática» (de la tasa que se muestra). */
  const metaMovil = ({ vigente }: FilaTasa): string => {
    const p = vigente.punto;
    if (!p) return '—';
    return p.fuente === 'manual' ? t('metaManual', { autor: autor(p.autorId) }) : tComun('automatica');
  };

  const accion = (f: FilaTasa, corto = false) =>
    f.vigente.delDia ? (
      <button type="button" onClick={() => onVerHistorial(f.moneda.code)} className="text-sm font-medium text-link hover:underline">
        {corto ? t('historial') : t('verHistorial')}
      </button>
    ) : (
      <button type="button" onClick={() => onRegistrar(f.moneda.code, dia)} className="text-sm font-medium text-link hover:underline">
        {t('registrar')}
      </button>
    );

  const columnas: ColumnaTabla<FilaTasa>[] = [
    { id: 'moneda', encabezado: t('columnas.moneda'), celda: (f) => <span className="font-medium text-fg">{f.moneda.name}</span> },
    { id: 'codigo', encabezado: t('columnas.codigo'), variante: 'mono', celda: (f) => f.moneda.code },
    {
      id: 'tasa',
      encabezado: t('columnas.unidad'),
      variante: 'importe',
      celda: (f) =>
        f.vigente.delDia && f.vigente.punto ? formato.tasa(f.vigente.punto.tasa) : <span className="text-fg-muted">{t('sinTasaDia', { hoy: esHoy })}</span>,
    },
    {
      id: 'variacion',
      encabezado: t('columnas.variacion'),
      alinear: 'derecha',
      ocultarDebajo: 'md',
      celda: (f) => <Variacion valor={f.vigente.variacion} formato={formato.porcentaje} />,
    },
    { id: 'fuente', encabezado: t('columnas.fuente'), celda: (f) => <span className="text-fg-secondary">{fuente(f)}</span> },
    { id: 'accion', encabezado: t('columnas.accion'), alinear: 'derecha', celda: (f) => accion(f) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
        <FormField etiqueta={t('fecha')} className="w-full sm:w-56">
          {(campo) => <CampoFecha id={campo.id} valor={dia} onValorChange={(v) => setFecha(v || hoy)} max={hoy} hoy={hoy} limpiable={false} />}
        </FormField>
        {datos.estado === 'listo' && (
          <span className="inline-flex w-fit items-center rounded-full border border-line-info bg-info-subtle px-2.5 py-0.5 text-xs font-medium text-info-text sm:mb-2.5">
            {catalogoDelDia ? t('fuenteAutomatica', { hora: horaCatalogo }) : t('sinCatalogo')}
          </span>
        )}
      </div>

      {sinNada && (
        <AvisoTonal
          tono="neutro"
          titulo={t('catalogoVacioTitulo')}
          descripcion={t('catalogoVacio')}
          accion={{ etiqueta: sincronizando ? tComun('sincronizando') : tComun('sincronizar'), onClick: sincronizarCatalogo }}
        />
      )}

      <DataTable
        etiqueta={t('etiqueta', { dia: formato.dia(dia) })}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => f.moneda.code}
        estado={datos.estado === 'cargando' ? 'cargando' : datos.estado === 'error' ? 'error' : 'listo'}
        onReintentar={datos.recargar}
        filasEsqueleto={3}
        vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion', { base }), icono: Coins, accion: { etiqueta: t('vacio.accion'), onClick: onAgregarMoneda } }}
        error={{ titulo: t('errorCarga') }}
        tarjetaMovil={(f) => <TarjetaTasa fila={f} esHoy={esHoy} meta={metaMovil(f)} accion={accion(f, true)} formato={formato} />}
      />

      <AvisoTonal tono="informacion" titulo={t('manualMandaTitulo')} descripcion={t('manualManda')} />
    </div>
  );
}

/** M5 · tarjeta móvil (captura 82-finanzas-r2-17). */
function TarjetaTasa({
  fila,
  esHoy,
  meta,
  accion,
  formato,
}: {
  fila: FilaTasa;
  esHoy: 'si' | 'no';
  meta: string;
  accion: ReactNode;
  formato: ReturnType<typeof useFormatoTasas>;
}) {
  const t = useTranslations('finanzasMonedasR2.tasas');
  const { moneda, vigente } = fila;
  const p = vigente.punto;
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4">
      <p className="text-base font-semibold text-fg">{t('tarjetaTitulo', { codigo: moneda.code, nombre: moneda.name })}</p>
      <p className="text-sm tabular-nums text-fg-secondary">
        {vigente.delDia && p
          ? t('unaUnidad', { codigo: moneda.code, tasa: formato.tasa(p.tasa) })
          : p
            ? t('sinTasaUsa', { tasa: formato.tasa(p.tasa), hoy: esHoy })
            : t('sinTasaDia', { hoy: esHoy })}
      </p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <p className="min-w-0 truncate text-xs text-fg-muted">{meta}</p>
        <span className="shrink-0">{accion}</span>
      </div>
    </div>
  );
}
