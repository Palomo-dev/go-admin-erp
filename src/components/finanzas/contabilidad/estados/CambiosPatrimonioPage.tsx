'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Landmark } from 'lucide-react';
import { AvisoTonal } from '@/components/kit';
import { BotonesExportar } from '../NivelReporte';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { filasPatrimonio, patrimonioConOtros, patrimonioCuadra } from '@/lib/finanzas/estados/presentacion';
import type { EstadoPatrimonio } from '@/lib/finanzas/estados/tipos';
import { useConsultaInicial, useInforme, usePeriodo } from './clienteEstados';
import { BandaCuadre, CuerpoInforme, Fila, FiltrosPeriodo, PaginaInforme, Tabla, useCifra } from './PiezasEstado';

export function CambiosPatrimonioPage() {
  const t = useTranslations('estadosFinancieros.patrimonio');
  const { formatear } = useMonedaOrganizacion();
  const cifra = useCifra(formatear);
  const periodo = usePeriodo();
  const { estado, datos, consultar } = useInforme<EstadoPatrimonio>('patrimonio', periodo.desde, periodo.hasta, false);
  useConsultaInicial(!!periodo.desde, consultar);
  const actual = datos?.actual ?? null;
  const tabla = useMemo(() => (actual ? filasPatrimonio(actual) : null), [actual]);
  const encabezados = tabla ? [t('concepto'), ...tabla.columnas.map((c) => t(`columna.${c}`)), t('total')] : [];

  return (
    <PaginaInforme
      titulo={t('titulo')}
      subtitulo={actual ? t('subtitulo', { desde: formatPlainDate(actual.desde), hasta: formatPlainDate(actual.hasta) }) : undefined}
      migas={t('miga')}
      icono={Landmark}
      acciones={actual && tabla && estado === 'listo' ? (
        <BotonesExportar
          nombre={`cambios-patrimonio-${actual.desde}-${actual.hasta}`}
          titulo={t('titulo')}
          columnas={encabezados}
          filas={tabla.filas.map((f) => [t(`fila.${f.clave}`), ...tabla.columnas.map((c) => f.valores[c]), f.total])}
        />
      ) : undefined}
    >
      <FiltrosPeriodo
        desde={periodo.desde}
        hasta={periodo.hasta}
        hoy={periodo.hoy}
        onDesde={periodo.setDesde}
        onHasta={periodo.setHasta}
        onConsultar={() => void consultar()}
        cargando={estado === 'cargando'}
      />
      <CuerpoInforme estado={estado} onReintentar={() => void consultar()}>
        {actual && tabla && (
          <>
            {patrimonioConOtros(actual) && (
              <AvisoTonal tono="advertencia" titulo={t('otros.titulo')} descripcion={t('otros.detalle')} />
            )}
            <Tabla etiqueta={t('titulo')} encabezados={encabezados}>
              {tabla.filas.map((f) => (
                <Fila
                  key={f.clave}
                  fuerte={f.esTotal}
                  celdas={[t(`fila.${f.clave}`), ...tabla.columnas.map((c) => cifra(f.valores[c])), cifra(f.total)]}
                />
              ))}
            </Tabla>
            <BandaCuadre
              cuadra={patrimonioCuadra(actual)}
              titulo={patrimonioCuadra(actual) ? t('cuadra') : t('noCuadra', { diferencia: cifra(actual.diferencia) })}
              detalle={t('cuadraDetalle')}
            />
          </>
        )}
      </CuerpoInforme>
    </PaginaInforme>
  );
}
