'use client';

/**
 * Tabla de dominios (Figma B/07-01) y, por debajo de lg, tarjetas (B/07-25).
 * Columnas: Dominio (icono, host, «Principal» y línea secundaria), Tipo,
 * Estado, Renovación, SSL y Acciones (botón contextual + «⋯»). Toda la fila
 * abre el detalle; el subdominio abre «Cambiar subdominio».
 *
 * Solo pinta: los datos y las acciones llegan de `useDominiosSitio` a través
 * de la pantalla.
 */
import { DataTable, ListCard, StatusBadge, clasesBoton, type AccionFila, type ColumnaTabla } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { DomainStatusBadge } from '../ui/DomainStatusBadge';
import { PriceTag } from '../ui/PriceTag';
import { ICONO_ACCION_DOMINIO, ICONO_SSL_EMITIDO, ICONO_TIPO_DOMINIO, IconoDominio } from './iconosDominios';
import { accionContextual, lineaSecundaria, type AccionContextual } from './estadoDominio';
import type { DominioSitio } from './tiposDominios';
import { useTextosDominios } from './textos';
import { useFormatoDominio } from './useFormatoDominio';

export interface ListaDominiosProps {
  dominios: readonly DominioSitio[];
  onAbrir: (d: DominioSitio) => void;
  onContextual: (d: DominioSitio, accion: Exclude<AccionContextual, null>) => void;
  acciones: (d: DominioSitio) => readonly AccionFila[];
  /** Sin `website.domains` no hay acciones de escritura. */
  soloLectura?: boolean;
  /** `cargando`: la tabla en esqueleto con la cabecera visible (B/07-02). */
  estado?: 'listo' | 'cargando';
}

export function InsigniaPrincipal() {
  const t = useTextosDominios();
  return <StatusBadge estado="principal" etiqueta={t('tabla.principal')} tono="marca" />;
}

/** Línea secundaria bajo el host (B/07-01). */
export function useLineaSecundaria() {
  const t = useTextosDominios();
  const f = useFormatoDominio();
  return (d: DominioSitio, hayPrincipalPropio: boolean): string => {
    const l = lineaSecundaria(d, hayPrincipalPropio);
    switch (l.clave) {
      case 'redirige':
        return t('linea.redirige', { host: l.host, codigo: l.codigo });
      case 'revisado':
        return t('linea.revisado', { hace: f.hace(l.en) });
      default:
        return t(`linea.${l.clave}`);
    }
  };
}

/** Texto de la columna «Renovación» (sin el precio). */
export function useTextoRenovacion() {
  const t = useTextosDominios();
  const f = useFormatoDominio();
  return (d: DominioSitio): string => {
    const r = d.renovacion;
    switch (r.tipo) {
      case 'automatica':
        return r.venceEn ? t('renovacion.automatica', { fecha: f.fecha(r.venceEn) }) : t('renovacion.automaticaSinFecha');
      case 'apagada':
        return r.venceEn ? t('renovacion.apagada', { fecha: f.fecha(r.venceEn) }) : t('renovacion.apagadaSinFecha');
      case 'incluida':
        return t('renovacion.incluida', { host: r.con });
      case 'proveedor':
        return t('renovacion.proveedor');
      default:
        return t('renovacion.noVence');
    }
  };
}

/** Línea de la tarjeta móvil (B/07-25). */
function useLineaMovil() {
  const t = useTextosDominios();
  const f = useFormatoDominio();
  const linea = useLineaSecundaria();
  return (d: DominioSitio, hayPrincipalPropio: boolean): string => {
    if (d.tipo === 'subdominio') return t('movil.subdominio');
    if (d.estado === 'verificando' || d.estado === 'pendiente' || d.estado === 'mal_configurado') return linea(d, hayPrincipalPropio);
    if (d.tipo === 'alias_www') return t('movil.alias', { host: d.redirigeA ?? d.host.replace(/^www\./, '') });
    if (d.tipo === 'propio') return t('movil.propio');
    if (d.renovacion.tipo === 'apagada') return t('movil.compradoApagada');
    if (d.renovacion.tipo === 'automatica' && d.renovacion.venceEn) return t('movil.comprado', { fecha: f.fecha(d.renovacion.venceEn) });
    return t('movil.compradoSinFecha');
  };
}

export function ListaDominios({ dominios, onAbrir, onContextual, acciones, soloLectura, estado = 'listo' }: ListaDominiosProps) {
  const t = useTextosDominios();
  const linea = useLineaSecundaria();
  const lineaMovil = useLineaMovil();
  const renovacion = useTextoRenovacion();
  const hayPrincipalPropio = dominios.some((d) => d.principal && d.tipo !== 'subdominio');

  const columnas: ColumnaTabla<DominioSitio>[] = [
    {
      id: 'dominio',
      encabezado: t('tabla.dominio'),
      celda: (d) => {
        return (
          <div className="flex min-w-0 items-start gap-2">
            <IconoDominio icono={ICONO_TIPO_DOMINIO[d.tipo]} className="mt-0.5 text-fg-secondary" />
            <div className="flex min-w-0 flex-col">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium text-fg">{d.host}</span>
                {d.principal && <InsigniaPrincipal />}
              </span>
              <span className={cn('truncate text-xs', d.estado === 'mal_configurado' ? 'text-danger-text' : 'text-fg-secondary')}>
                {linea(d, hayPrincipalPropio)}
              </span>
            </div>
          </div>
        );
      },
    },
    { id: 'tipo', encabezado: t('tabla.tipo'), celda: (d) => <span className="text-sm text-fg">{t(`tipo.${d.tipo}`)}</span>, ocultarDebajo: 'xl' },
    {
      id: 'estado',
      encabezado: t('tabla.estado'),
      celda: (d) => <DomainStatusBadge estado={d.estado} diasParaVencer={d.diasParaVencer} />,
    },
    {
      id: 'renovacion',
      encabezado: t('tabla.renovacion'),
      celda: (d) => {
        const r = d.renovacion;
        const apagada = r.tipo === 'apagada';
        return (
          <div className="flex flex-col gap-0.5">
            <span className={cn('text-sm', apagada ? 'text-warning-text' : 'text-fg')}>{renovacion(d)}</span>
            {(r.tipo === 'automatica' || r.tipo === 'apagada') && r.precio !== null && r.moneda && <PriceTag valor={r.precio} moneda={r.moneda} />}
          </div>
        );
      },
    },
    {
      id: 'ssl',
      encabezado: t('tabla.ssl'),
      celda: (d) =>
        d.ssl === 'emitido' ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-success-text">
            <IconoDominio icono={ICONO_SSL_EMITIDO} />
            {t('ssl.emitido')}
          </span>
        ) : d.ssl === 'pendiente' ? (
          <span className="text-sm text-fg-secondary">{t('ssl.pendiente')}</span>
        ) : (
          <span className="text-sm text-fg-muted">—</span>
        ),
      ocultarDebajo: 'lg',
    },
  ];

  return (
    <DataTable
      etiqueta={t('tabla.etiqueta')}
      estado={estado}
      filasEsqueleto={5}
      columnas={columnas}
      filas={dominios}
      obtenerId={(d) => d.id}
      etiquetaFila={(d) => d.host}
      onFilaClick={onAbrir}
      tonoFila={(d) => (d.estado === 'vence_pronto' ? 'advertencia' : d.estado === 'vencido' ? 'peligro' : undefined)}
      acciones={(d) => acciones(d)}
      accionesRapidas={(d) => {
        const a = soloLectura ? null : accionContextual(d);
        if (!a) return null;
        const variante = a === 'registros' ? 'fantasma' : 'secundario';
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onContextual(d, a);
            }}
            className={clasesBoton({ variante, tamano: 'sm' })}
          >
            <IconoDominio icono={ICONO_ACCION_DOMINIO[a]} />
            {t(`fila.${a}`)}
          </button>
        );
      }}
      tarjetaMovil={(d) => (
        <ListCard
          titulo={d.host}
          insignia={d.principal ? <InsigniaPrincipal /> : undefined}
          etiquetas={<DomainStatusBadge estado={d.estado} diasParaVencer={d.diasParaVencer} />}
          meta={lineaMovil(d, hayPrincipalPropio)}
          estado={<IconoDominio icono={ICONO_ACCION_DOMINIO.abrir} tamano="fila" className="text-fg-muted" />}
          onClick={() => onAbrir(d)}
        />
      )}
    />
  );
}
