'use client';

/**
 * Pronóstico del trimestre por categorías (Figma CRM 1431:19 «por vendedor»,
 * 1434:648 «oportunidades por categoría», 1434:1185 «ajuste con motivo»,
 * 1434:842149 «sin cuotas», 1434:842588 «cargando», 1434:843089 móvil).
 *
 * Todo lo calcula el servidor (`GET /api/crm/forecast` → RPC
 * `crm_forecast_snapshot`): quién ve a quién (`crm.forecast.view_all`),
 * quién ajusta (`crm.forecast.adjust`) y quién cambia categorías. Sin
 * `view_all` la vista es «Mi pronóstico».
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { EmptyState } from '@/components/kit/EmptyState';
import { clasesBoton } from '@/components/kit/botonClases';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import type { FilaPronostico } from '@/lib/services/crm/forecastLogica';
import { CifrasTrimestre } from './CifrasTrimestre';
import { TablaVendedoresPronostico } from './TablaVendedoresPronostico';
import { OportunidadesPronostico } from './OportunidadesPronostico';
import { DialogoAjustePronostico } from './DialogoAjustePronostico';
import { nombreVendedor, opcionesTrimestre, partesTrimestre } from './trimestreLogica';
import { usePronosticoTrimestre } from './usePronosticoTrimestre';

type Vista = 'equipo' | 'mio';

export function PronosticoTrimestre() {
  const t = useTranslations('crm.pronosticoTrimestre');
  const [periodo, setPeriodo] = useState<string | null>(null);
  const [equipo, setEquipo] = useState<string | null>(null);
  const [vendedor, setVendedor] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('equipo');
  const [pagina, setPagina] = useState(1);
  const [revision, setRevision] = useState(0);
  const [ajustar, setAjustar] = useState<FilaPronostico | null>(null);
  const { estado, datos } = usePronosticoTrimestre({ period: periodo, team_id: equipo, user_id: vendedor, page: pagina }, revision);
  const recargar = () => setRevision((n) => n + 1);

  if (estado !== 'listo' && !datos) {
    return estado === 'cargando' ? (
      <div aria-busy="true" aria-label={t('cargando')} className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-subtle" />)}</div>
        <div className="h-20 animate-pulse rounded-xl bg-subtle" />
        <div className="h-64 animate-pulse rounded-xl bg-subtle" />
      </div>
    ) : (
      <EmptyState variante={estado === 'sinPermiso' ? 'forbidden' : 'error'} titulo={t(estado === 'sinPermiso' ? 'sinPermiso' : 'error')} onReintentar={estado === 'error' ? recargar : undefined} />
    );
  }
  if (!datos) return null;

  const vistaEfectiva: Vista = datos.canViewAll ? vista : 'mio';
  const enDetalle = vendedor !== null || vistaEfectiva === 'mio';
  const periodoActual = datos.period;
  const nombreDe = (id: string | null) => (id ? nombreVendedor(datos.sellers.find((u) => u.id === id)) : null) ?? t('vendedores.sinNombre');
  const cambiarVista = (v: Vista) => {
    setVista(v);
    setVendedor(v === 'mio' ? datos.currentUserId : null);
    setPagina(1);
  };

  return (
    <div className="space-y-4" aria-busy={estado === 'cargando'}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <SelectCrm
            aria-label={t('periodo')}
            valor={periodoActual}
            onValorChange={(v) => { setPeriodo(v); setPagina(1); }}
            opciones={opcionesTrimestre(periodoActual).map((p) => ({ valor: p, etiqueta: t('trimestre', partesTrimestre(p)) }))}
          />
        </div>
        {datos.canViewAll && datos.teams.length > 0 && (
          <div className="w-52">
            <SelectCrm aria-label={t('equipo')} valor={equipo ?? ''} opcionVacia={t('todosLosEquipos')} onValorChange={(v) => { setEquipo(v || null); setPagina(1); }} opciones={datos.teams.map((e) => ({ valor: e.id, etiqueta: e.name }))} />
          </div>
        )}
        {datos.canViewAll && (
          <SegmentedControl<Vista> etiqueta={t('vista')} valor={vistaEfectiva} onValorChange={cambiarVista} opciones={[{ valor: 'equipo', etiqueta: t('vistas.equipo') }, { valor: 'mio', etiqueta: t('vistas.mio') }]} />
        )}
      </div>

      {vendedor && vistaEfectiva === 'equipo' && (
        <div className="flex items-center gap-2">
          <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => { setVendedor(null); setPagina(1); }}>
            <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('volverEquipo')}
          </button>
          <h2 className="text-base font-semibold text-fg">{nombreDe(vendedor)}</h2>
        </div>
      )}

      <CifrasTrimestre resumen={datos.summary} moneda={datos.moneda} />

      {enDetalle ? (
        <OportunidadesPronostico
          filas={datos.opportunities}
          total={datos.opportunityCount}
          pagina={pagina}
          onPagina={setPagina}
          moneda={datos.moneda}
          estado={estado === 'cargando' ? 'cargando' : 'listo'}
          onCambio={recargar}
        />
      ) : (
        <TablaVendedoresPronostico
          filas={datos.rows}
          vendedores={datos.sellers}
          moneda={datos.moneda}
          puedeAjustar={datos.canAdjust}
          onVer={(id) => { setVendedor(id); setPagina(1); }}
          onAjustar={setAjustar}
        />
      )}

      <DialogoAjustePronostico
        fila={ajustar}
        nombre={nombreDe(ajustar?.userId ?? null)}
        periodo={periodoActual}
        moneda={datos.moneda}
        onCerrar={() => setAjustar(null)}
        onGuardado={() => { setAjustar(null); recargar(); }}
      />
    </div>
  );
}
