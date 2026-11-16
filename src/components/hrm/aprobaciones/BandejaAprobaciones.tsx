'use client';

/**
 * Mis aprobaciones (Figma 20.7, `docs/design/figma/95-hrm-07-*`): solicitudes
 * de RR. HH. que le toca aprobar al usuario (incluidas las que le llegan por
 * delegación), las más antiguas primero, y las que ya resolvió.
 * `GET /api/hrm/aprobaciones/bandeja?estado=`; revisar y decidir en
 * `DialogoRevisarAprobacion`.
 *
 * Figma corregido (2026-11-15): pestañas del módulo en el `debajo` del
 * PageHeader, un buscador con «Filtros» (tipo, quién pidió, efecto este mes y
 * —fuera del diseño, para no perder las ya resueltas— el estado) y «⋮» por fila.
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, Stamp } from 'lucide-react';
import {
  AvisoTonal,
  DataTable,
  FilterChips,
  FilterPanel,
  FormField,
  ListCard,
  ListToolbar,
  PageHeader,
  SearchInput,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatNumeroMoneda } from '@/lib/utils/moneda';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useCarga } from '../personas/apiPersonas';
import { fechaCorta } from '../personas/textosPersonas';
import { NavPestanasHrm } from '../navegacion/NavPestanasHrm';
import { DialogoRevisarAprobacion } from './DialogoRevisarAprobacion';
import {
  FILTROS_BANDEJA,
  claveTitulo,
  conteoFiltrosBandeja,
  diasDesde,
  diferencia,
  filtrarSolicitudes,
  tieneSalarioOculto,
  type FiltrosBandeja,
  type GrupoTipo,
  type Solicitud,
} from './bandejaLogica';

const GRUPOS: readonly GrupoTipo[] = ['todas', 'salario_cargo', 'plazas', 'seguridad', 'sede_jornada'];

export function BandejaAprobaciones() {
  const t = useTranslations('hrmPersonas.aprobaciones');
  const tc = useTranslations('hrmPersonas.comun');
  const { formatDate, getToday } = useFormatDate();
  const moneda = useMonedaOrganizacion();
  const [estado, setEstado] = useState<'pendientes' | 'resueltas'>('pendientes');
  const [filtros, setFiltros] = useState<FiltrosBandeja>(FILTROS_BANDEJA);
  const [revisar, setRevisar] = useState<string | null>(null);
  const { carga, recargar } = useCarga<{ solicitudes: Solicitud[]; ver_montos: boolean }>(`/api/hrm/aprobaciones/bandeja?estado=${estado}`);

  const todas = useMemo(() => (carga.estado === 'listo' ? carga.datos.solicitudes : []), [carga]);
  const hoy = getToday();
  const filas = useMemo(() => filtrarSolicitudes(todas, filtros, hoy, (s) => t(`tipos.${claveTitulo(s)}`)), [todas, filtros, hoy, t]);
  const pendientes = estado === 'pendientes' ? todas.length : null;
  const solicitantes = useMemo(
    () => Array.from(new Set(todas.map((s) => s.solicito).filter((x): x is string => !!x))).sort((a, b) => a.localeCompare(b, 'es')),
    [todas]
  );
  const cambiar = (f: Partial<FiltrosBandeja>) => setFiltros((x) => ({ ...x, ...f }));
  const limpiar = () => {
    setFiltros((x) => ({ ...FILTROS_BANDEJA, texto: x.texto }));
    setEstado('pendientes');
  };
  const conteo = conteoFiltrosBandeja(filtros) + (estado === 'resueltas' ? 1 : 0);
  const chips: ChipFiltro[] = [
    ...(estado === 'resueltas' ? [{ clave: 'estado', etiqueta: t('resueltas') }] : []),
    ...(filtros.grupo !== 'todas' ? [{ clave: 'grupo', etiqueta: t(`grupos.${filtros.grupo}`) }] : []),
    ...(filtros.solicito ? [{ clave: 'solicito', etiqueta: t('filtros.pidio', { nombre: filtros.solicito }) }] : []),
    ...(filtros.esteMes ? [{ clave: 'esteMes', etiqueta: t('filtros.esteMes') }] : []),
  ];
  const quitarChip = (clave: string) => {
    if (clave === 'estado') setEstado('pendientes');
    else if (clave === 'grupo') cambiar({ grupo: 'todas' });
    else if (clave === 'solicito') cambiar({ solicito: null });
    else if (clave === 'esteMes') cambiar({ esteMes: false });
  };
  const accionesDe = (s: Solicitud): AccionFila[] => [
    { id: 'revisar', etiqueta: estado === 'pendientes' ? t('revisar') : t('ver'), icono: Eye, onSelect: () => setRevisar(s.id) },
  ];

  const monto = (s: Solicitud) => {
    const d = diferencia(s);
    if (d) {
      const signo = d.pct === null ? '' : d.diferencia >= 0 ? '+ ' : '− ';
      return t('alMes', { monto: `${signo}${formatNumeroMoneda(d.pct === null ? d.nuevo : Math.abs(d.diferencia), moneda.code)}` });
    }
    return tieneSalarioOculto(s) ? t('oculto') : '—';
  };
  const para = (s: Solicitud) => {
    const cargo = s.eventos.find((e) => e.campo === 'cargo');
    const ss = s.eventos.find((e) => ['eps', 'afp', 'arl', 'ccf', 'cesantias'].includes(e.campo));
    const detalle = cargo
      ? `${cargo.anterior_nombre ?? '—'} → ${cargo.nuevo_nombre ?? '—'}`
      : ss
        ? `${ss.anterior_nombre ?? '—'} → ${ss.nuevo_nombre ?? '—'}`
        : s.persona?.cargo;
    return { nombre: s.persona?.nombre ?? (s.contexto?.['cargo_nombre'] as string | undefined) ?? '—', detalle: [detalle, s.persona?.sede].filter(Boolean).join(' · ') };
  };
  const solicito = (s: Solicitud) => {
    const dias = diasDesde(s.creado);
    return (
      <div className="min-w-0">
        <p className="truncate text-fg">{s.solicito ?? '—'}</p>
        <p className={dias >= 3 && estado === 'pendientes' ? 'text-xs text-warning-text' : 'text-xs text-fg-secondary'}>
          {`${formatDate(s.creado)} · ${dias === 0 ? t('hoy') : t('haceDias', { n: dias })}`}
        </p>
      </div>
    );
  };
  const tipo = (s: Solicitud) => (
    <div className="min-w-0">
      <p className="truncate font-medium text-fg">{t(`tipos.${claveTitulo(s)}`)}</p>
      {s.eventos.length > 1 ? <p className="text-xs text-fg-secondary">{t('ligados', { n: s.eventos.length })}</p> : null}
    </div>
  );

  const columnas: ColumnaTabla<Solicitud>[] = [
    { id: 'tipo', encabezado: t('columnas.tipo'), celda: tipo },
    {
      id: 'para',
      encabezado: t('columnas.para'),
      celda: (s) => {
        const p = para(s);
        return (
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{p.nombre}</p>
            <p className="truncate text-xs text-fg-secondary">{p.detalle}</p>
          </div>
        );
      },
    },
    { id: 'solicito', encabezado: t('columnas.solicito'), ocultarDebajo: 'lg', celda: solicito },
    { id: 'monto', encabezado: t('columnas.monto'), ocultarDebajo: 'md', celda: (s) => <span className="whitespace-nowrap font-medium tabular-nums text-fg">{monto(s)}</span> },
    { id: 'efecto', encabezado: t('columnas.efecto'), ocultarDebajo: 'md', celda: (s) => <span className="tabular-nums">{s.efecto ? fechaCorta(s.efecto) : '—'}</span> },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={Stamp}
        migas={[{ etiqueta: tc('migas.rrhh'), href: '/app/hrm/empleados' }, { etiqueta: t('titulo') }]}
        cargando={carga.estado === 'cargando'}
        debajo={<NavPestanasHrm incrustada />}
        movil={{ subtitulo: pendientes != null ? t('nPendientes', { n: pendientes }) : undefined }}
      />
      {carga.estado !== 'sinPermiso' && (
        <ListToolbar
          busqueda={
            <SearchInput
              value={filtros.texto}
              onChange={(v) => cambiar({ texto: v })}
              cargando={carga.estado === 'cargando'}
              placeholder={t('filtros.buscar')}
              etiqueta={t('filtros.buscar')}
            />
          }
          filtros={
            <FilterPanel conteo={conteo} onLimpiar={limpiar} textoVerResultados={t('filtros.verN', { n: filas.length })}>
              <FormField etiqueta={t('estado')}>
                {(c) => (
                  <Select value={estado} onValueChange={(v) => setEstado(v as 'pendientes' | 'resueltas')}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendientes">{t('pendientes')}</SelectItem>
                      <SelectItem value="resueltas">{t('resueltas')}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('filtrar')}>
                {(c) => (
                  <Select value={filtros.grupo} onValueChange={(v) => cambiar({ grupo: v as GrupoTipo })}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GRUPOS.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g === 'todas' ? t('filtros.todosTipos') : t(`grupos.${g}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('columnas.solicito')}>
                {(c) => (
                  <Select value={filtros.solicito ?? '__todas'} onValueChange={(v) => cambiar({ solicito: v === '__todas' ? null : v })}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__todas">{t('filtros.cualquiera')}</SelectItem>
                      {solicitantes.map((n) => (
                        <SelectItem key={n} value={n}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm text-fg">
                <Checkbox checked={filtros.esteMes} onCheckedChange={(v) => cambiar({ esteMes: v === true })} />
                {t('filtros.esteMes')}
              </label>
            </FilterPanel>
          }
          chips={chips.length > 0 ? <FilterChips chips={chips} onQuitar={quitarChip} onLimpiarTodo={limpiar} /> : undefined}
        />
      )}

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(s) => s.id}
        estado={
          carga.estado === 'cargando'
            ? 'cargando'
            : carga.estado === 'sinPermiso'
              ? 'sinPermiso'
              : carga.estado !== 'listo'
                ? 'error'
                : filas.length === 0
                  ? todas.length === 0
                    ? 'vacio'
                    : 'sinResultados'
                  : 'listo'
        }
        onFilaClick={(s) => setRevisar(s.id)}
        etiquetaFila={(s) => t('etiquetaFila', { tipo: t(`tipos.${claveTitulo(s)}`), nombre: para(s).nombre })}
        acciones={accionesDe}
        tarjetaMovil={(s) => (
          <ListCard
            icono={Stamp}
            titulo={t(`tipos.${claveTitulo(s)}`)}
            subtitulo={[para(s).nombre, para(s).detalle].filter(Boolean).join(' · ')}
            meta={[monto(s) !== '—' ? monto(s) : null, s.efecto ? t('efectoCorto', { fecha: fechaCorta(s.efecto) }) : null].filter(Boolean).join(' · ')}
            estado={<span className="text-xs text-fg-secondary">{`${s.solicito ?? '—'} · ${diasDesde(s.creado) === 0 ? t('hoy') : t('haceDias', { n: diasDesde(s.creado) })}`}</span>}
            onClick={() => setRevisar(s.id)}
            acciones={accionesDe(s)}
          />
        )}
        vacio={{
          titulo: estado === 'pendientes' ? t('vacio.titulo') : t('vacio.resueltas'),
          descripcion: estado === 'pendientes' ? t('vacio.descripcion') : undefined,
          icono: Stamp,
          accion: { etiqueta: t('vacio.accion'), href: '/app/hrm/empleados' },
        }}
        sinResultados={{ descripcion: t('sinResultados') }}
        onLimpiarFiltros={limpiar}
        termino={filtros.texto}
        error={{ titulo: tc('errorCarga') }}
        onReintentar={() => void recargar()}
      />

      {carga.estado === 'listo' && todas.length > 0 && (
        <AvisoTonal tono="informacion" titulo={carga.datos.ver_montos ? t('notaMontos') : t('notaSinMontos')} />
      )}

      <DialogoRevisarAprobacion
        instanciaId={revisar}
        abierto={revisar !== null}
        onAbiertoChange={(a) => !a && setRevisar(null)}
        onResuelta={() => void recargar()}
      />
    </div>
  );
}
