'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BookOpen } from 'lucide-react';
import { AvisoTonal, ChipsOpcion, StatusBadge, clasesBoton } from '@/components/kit';
import { toastError } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { descargarExcel, descargarPdf } from '@/lib/finanzas/reportes/exportarReporte';
import { LIBROS, tablaDeLibro, type IdLibro } from '@/lib/finanzas/estados/libros';
import { leerLibro, usePeriodo } from './clienteEstados';
import { Fila, FiltrosPeriodo, PaginaInforme, Tabla } from './PiezasEstado';

type Formato = 'excel' | 'pdf';
const NIVELES = ['2', '4', '6', '8'] as const;
type Nivel = (typeof NIVELES)[number];

/** Figma «Escritorio / Libros contables»: cada libro se exporta del periodo elegido. */
export function LibrosContablesPage() {
  const t = useTranslations('estadosFinancieros.libros');
  const periodo = usePeriodo();
  const { formatDate } = useFormatDate();
  const [nivel, setNivel] = useState<Nivel>('4');
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [truncado, setTruncado] = useState(false);

  const exportar = async (libro: IdLibro, formato: Formato) => {
    setTrabajando(`${libro}:${formato}`);
    setTruncado(false);
    try {
      const datos = await leerLibro<unknown>(libro, periodo.desde, periodo.hasta, Number(nivel));
      const tabla = tablaDeLibro(libro, datos, formatDate);
      setTruncado(tabla.truncado);
      if (tabla.filas.length === 0) {
        toastError(t('sinMovimientos'));
        return;
      }
      const columnas = tabla.columnas.map((c) => t(`columna.${c}`));
      const nombre = `${libro}-${periodo.desde}-${periodo.hasta}`;
      if (formato === 'pdf') {
        await descargarPdf(nombre, t(`nombre.${libro}`), columnas, tabla.filas);
      } else {
        await descargarExcel(nombre, tabla.filas.map((fila) =>
          Object.fromEntries(columnas.map((c, i) => [c, fila[i] ?? '']))));
      }
    } catch (error) {
      console.error('No se pudo exportar el libro:', error);
      toastError(t('error'));
    } finally {
      setTrabajando(null);
    }
  };

  const boton = (libro: IdLibro, formato: Formato, texto: string) => (
    <button
      key={formato}
      type="button"
      className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
      disabled={!periodo.desde || !periodo.hasta || trabajando !== null}
      aria-label={`${t(`nombre.${libro}`)} ${texto}`}
      onClick={() => void exportar(libro, formato)}
    >
      {trabajando === `${libro}:${formato}` ? t('generando') : texto}
    </button>
  );

  return (
    <PaginaInforme titulo={t('titulo')} subtitulo={t('subtitulo')} migas={t('miga')} icono={BookOpen}>
      <FiltrosPeriodo
        desde={periodo.desde}
        hasta={periodo.hasta}
        hoy={periodo.hoy}
        onDesde={periodo.setDesde}
        onHasta={periodo.setHasta}
      >
        <div className="space-y-1 text-xs text-fg-secondary">
          <span>{t('nivel')}</span>
          <ChipsOpcion
            etiqueta={t('nivel')}
            valor={nivel}
            onValorChange={setNivel}
            opciones={NIVELES.map((n) => ({ valor: n, etiqueta: t(`niveles.n${n}`) }))}
          />
        </div>
      </FiltrosPeriodo>
      {truncado && <AvisoTonal tono="advertencia" titulo={t('truncado')} />}
      <Tabla etiqueta={t('titulo')} encabezados={[t('libro'), t('contenido'), t('estado'), '']}>
        {LIBROS.map((libro) => (
          <Fila
            key={libro}
            celdas={[
              t(`nombre.${libro}`),
              t(`descripcion.${libro}`),
              <StatusBadge key="estado" estado="disponible" etiqueta={t('disponible')} tono="exito" />,
              <span key="acciones" className="inline-flex gap-1">{boton(libro, 'excel', 'Excel')}{boton(libro, 'pdf', 'PDF')}</span>,
            ]}
          />
        ))}
      </Tabla>
    </PaginaInforme>
  );
}
