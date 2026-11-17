'use client';

/**
 * Configuración › Recursos humanos › Nómina (Figma 20.24.1 y 24.4–24.6).
 *
 * Solo lectura en esta fase: el estado de «Nómina activa» (lo enciende GO Admin con
 * `fn_hr_nomina_habilitar`, después de la aprobación escrita del Contador), los
 * pasos que faltan, la vista previa del plan de cuentas, los terceros sin NIT y el
 * catálogo de conceptos con sus cuentas. Editar la cuenta de un concepto (24.2)
 * queda pendiente (ver la entrega).
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Lock } from 'lucide-react';
import { AvisoTonal, DataTable, EmptyState, ListToolbar, SearchInput, Skeleton, StatusBadge, Tarjeta, type ColumnaTabla } from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import { useConfiguracionNomina, type ConfiguracionNomina } from './apiNomina';
import { normalizar } from './nominaLogica';
import { DetallePlan, PasosEncendido } from './DialogoNominaApagada';

type Concepto = ConfiguracionNomina['conceptos'][number];

export function ConfiguracionNominaPanel() {
  const t = useTranslations('hrmNomina.configuracion');
  const { carga, recargar } = useConfiguracionNomina();
  const [texto, setTexto] = useState('');
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const filas = useMemo(() => {
    const q = normalizar(texto);
    return (datos?.conceptos ?? []).filter((c) => !q || normalizar(`${c.codigo} ${c.nombre} ${c.cuenta_debito ?? ''} ${c.cuenta_credito ?? ''}`).includes(q));
  }, [datos, texto]);

  if (carga.estado === 'cargando') return <Skeleton className="h-[480px] w-full rounded-xl" />;
  if (carga.estado === 'sinPermiso') return <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} />;
  if (!datos) return <EmptyState variante="error" onReintentar={() => void recargar()} />;

  const si = (v: boolean) => (v ? t('si') : t('no'));
  const columnas: ColumnaTabla<Concepto>[] = [
    { id: 'codigo', encabezado: t('columnas.codigo'), variante: 'mono', celda: (c) => c.codigo },
    { id: 'nombre', encabezado: t('columnas.concepto'), celda: (c) => c.nombre },
    {
      id: 'tipo',
      encabezado: t('columnas.tipo'),
      celda: (c) => <StatusBadge estado={c.tipo} etiqueta={t.has(`tipos.${c.tipo}`) ? t(`tipos.${c.tipo}`) : c.tipo} tono={c.tipo === 'devengado' ? 'informacion' : 'neutro'} apariencia="contorno" />,
    },
    { id: 'salarial', encabezado: t('columnas.salarial'), ocultarDebajo: 'md', celda: (c) => (c.tipo === 'devengado' ? si(c.salarial) : '—') },
    { id: 'prestacional', encabezado: t('columnas.prestacional'), ocultarDebajo: 'md', celda: (c) => (c.tipo === 'devengado' ? si(c.prestacional) : '—') },
    { id: 'cuenta', encabezado: t('columnas.cuenta'), variante: 'mono', celda: (c) => [c.cuenta_debito, c.cuenta_credito].filter(Boolean).join(' / ') || '—' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-secondary">{t('intro')}</p>
      {!datos.habilitada ? <AvisoTonal tono="advertencia" icono={Lock} titulo={t('apagada.titulo')} descripcion={t('apagada.descripcion')} /> : null}
      <Tarjeta>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-medium text-fg">{t('activa.titulo')}</p>
            <p className="text-[13px] text-fg-secondary">{datos.habilitada ? t('activa.encendida') : t('activa.apagada')}</p>
            <p className="mt-2 text-[13px] leading-[18px] text-fg-secondary">{t('activa.porQue')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusBadge estado="solo_go_admin" etiqueta={t('activa.soloGoAdmin')} tono="neutro" apariencia="contorno" icono={Lock} />
            <Switch checked={datos.habilitada} disabled aria-label={t('activa.titulo')} />
          </div>
        </div>
      </Tarjeta>
      <PasosEncendido datos={datos} />
      <DetallePlan datos={datos} />
      <h3 className="mt-2 text-base font-semibold text-fg">{t('conceptos')}</h3>
      <ListToolbar busqueda={<SearchInput value={texto} onChange={setTexto} placeholder={t('buscar')} etiqueta={t('buscar')} />} />
      <DataTable
        etiqueta={t('conceptos')}
        columnas={columnas}
        filas={filas}
        obtenerId={(c) => c.codigo}
        densidad="compacta"
        estado={filas.length ? 'listo' : texto ? 'sinResultados' : 'vacio'}
        termino={texto}
        onLimpiarFiltros={() => setTexto('')}
      />
    </div>
  );
}
