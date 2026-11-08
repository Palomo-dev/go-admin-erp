'use client';

/**
 * Panel plegable «Datos fiscales de la línea» de un documento (factura de venta,
 * nota, factura de compra, documento soporte o venta POS). Muestra, por línea,
 * la clasificación de IVA guardada (o «sin clasificar») y, en compras, la
 * procedencia del descontable; cada línea abre `ClasificarLineaDialogo`.
 *
 * Va FUERA del flujo de emisión: se carga al abrirlo y no toca importes. Al
 * crear la línea la base ya guarda la sugerencia del producto; aquí se confirma
 * o se corrige. Mientras la migración 20261108150000 no esté aplicada, dice
 * «pendiente de activar».
 */
import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { SeccionPlegable, StatusBadge, clasesBoton } from '@/components/kit';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import type { LineaFiscal, TipoDocumentoLineas } from '@/lib/finanzas/tributario/formulario300';
import { clienteIva300, type LineasCliente } from './clienteIva300';
import { ClasificarLineaDialogo } from './ClasificarLineaDialogo';
import { AvisoPendienteActivar, ErrorLectura, codigoDe, type Lectura } from '../piezas';

export function ResumenClasificacion({ l }: { l: LineaFiscal }) {
  const t = useTranslations('finanzasIva300.clasificar');
  const c = l.clasificacion;
  if (!c.tratamiento) return <StatusBadge estado="sin_clasificar" etiqueta={t('sinClasificar')} tono="advertencia" />;
  const texto = [t(`tratamientos.${c.tratamiento}`), c.tratamiento === 'gravada' ? `${c.tarifa ?? 0} %` : null, c.tipoOperacion ? t(`tipos.${c.tipoOperacion}`) : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <span className="flex flex-wrap items-center gap-1">
      <StatusBadge estado={c.tratamiento} etiqueta={texto} tono={c.tipoOperacion ? 'neutro' : 'advertencia'} />
      {c.origen && <span className="text-xs text-fg-secondary">{t(`origenes.${c.origen}`)}</span>}
      {l.descontable && (
        <StatusBadge
          estado={l.descontable.estado}
          etiqueta={t(`descontables.${l.descontable.estado}`)}
          tono={l.descontable.estado === 'por_evaluar' ? 'advertencia' : l.descontable.estado === 'descontable' ? 'exito' : 'neutro'}
        />
      )}
    </span>
  );
}

export function DatosFiscalesLineas({ tipo, id }: { tipo: TipoDocumentoLineas; id: string }) {
  const t = useTranslations('finanzasIva300.panel');
  const { formatear } = useMonedaOrganizacion();
  const [abierta, setAbierta] = useState(false);
  const [lectura, setLectura] = useState<Lectura<LineasCliente> | null>(null);
  const [linea, setLinea] = useState<LineaFiscal | null>(null);

  const cargar = useCallback(async () => {
    setLectura({ estado: 'cargando' });
    try {
      setLectura({ estado: 'listo', datos: await clienteIva300.lineas(tipo, id) });
    } catch (err) {
      setLectura({ estado: 'error', codigo: codigoDe(err) });
    }
  }, [tipo, id]);

  const datos = lectura?.estado === 'listo' ? lectura.datos : null;
  const lineas = datos?.estado === 'listo' ? datos.lineas : [];
  const sinClasificar = lineas.filter((l) => !l.clasificacion.tratamiento).length;
  const porEvaluar = lineas.filter((l) => l.descontable?.estado === 'por_evaluar' && l.iva > 0).length;

  return (
    <SeccionPlegable
      titulo={t('titulo')}
      icono={FileText}
      abierta={abierta}
      onAbiertaChange={(a) => {
        setAbierta(a);
        if (a && lectura === null) void cargar();
      }}
      resumen={datos?.estado === 'listo' ? t('resumen', { sinClasificar, porEvaluar }) : undefined}
    >
      <div className="space-y-3">
        <p className="text-sm text-fg-secondary">{t('ayuda')}</p>
        {lectura?.estado === 'cargando' && <p className="text-sm text-fg-secondary">{t('cargando')}</p>}
        {lectura?.estado === 'error' && <ErrorLectura codigo={lectura.codigo} onReintentar={() => void cargar()} />}
        {datos?.estado === 'pendiente_activar' && <AvisoPendienteActivar descripcion={t('pendiente')} />}
        {datos?.estado === 'listo' && lineas.length === 0 && <p className="text-sm text-fg-secondary">{t('vacio')}</p>}
        {lineas.length > 0 && (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {lineas.map((l) => (
              <li key={l.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-medium text-fg">{l.descripcion || '—'}</p>
                  <p className="text-xs tabular-nums text-fg-secondary">{t('baseIva', { base: formatear(l.base), iva: formatear(l.iva) })}</p>
                  <ResumenClasificacion l={l} />
                </div>
                {datos?.puedeClasificar && (
                  <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setLinea(l)}>
                    {l.clasificacion.tratamiento ? t('editar') : t('clasificar')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <ClasificarLineaDialogo
        linea={linea}
        onCerrar={() => setLinea(null)}
        onGuardado={() => {
          setLinea(null);
          void cargar();
        }}
      />
    </SeccionPlegable>
  );
}
