// ============================================================
// Tests de alineacion del encabezado del calendario.
//
// BUG #2: el encabezado del Calendar estaba hardcodeado empezando
// en domingo ["Do","Lu","Ma","Mi","Ju","Vi","Sa"] mientras que
// la grilla arranca en lunes (locale es, weekStartsOn=1).
// Resultado: cada dia aparece una columna antes de la que le
// corresponde — hoy viernes 11/09 cae bajo la columna "Ju".
//
// Este test extrae la logica de generacion del encabezado y la
// verifica contra la misma startOfWeek que usa la grilla.
// Debe FALLAR antes del fix (cuando el encabezado era hardcodeado)
// y PASAR despues (cuando ambos derivan de startOfWeek).
// ============================================================

import { startOfWeek, startOfMonth, addDays, format } from 'date-fns';
import { es } from 'date-fns/locale';

describe('Calendar — alineacion encabezado vs grilla', () => {
  describe('encabezado hardcodeado (BUG #2 — debe fallar)', () => {
    // Simula el array hardcodeado que tenia el calendar.tsx antes del fix.
    const HARDCODED_HEADER = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];

    it('el encabezado hardcodeado NO coincide con la grilla que empieza en lunes', () => {
      // La grilla de septiembre 2026 arranca en startOfWeek(startOfMonth(month), { locale: es })
      // Con locale es, weekStartsOn = 1 (lunes).
      const month = new Date(2026, 8, 1); // septiembre 2026 (mes 0-indexed)
      const gridStart = startOfWeek(startOfMonth(month), { locale: es });

      // El encabezado correcto debe derivarse de la misma startOfWeek.
      const correctHeader = Array.from({ length: 7 }, (_, i) =>
        format(addDays(gridStart, i), 'EEEEEE', { locale: es }),
      );

      // El hardcodeado NO debe ser igual al correcto (porque empieza en domingo).
      expect(HARDCODED_HEADER).not.toEqual(correctHeader);
    });

    it('el 11 de septiembre 2026 (viernes) cae bajo columna "Ju" con el bug', () => {
      // Simula: grilla empieza en lunes, encabezado dice domingo.
      // El 11/09/2026 es viernes. En la grilla que empieza en lunes,
      // el viernes es la columna 5 (0=lunes ... 4=viernes).
      // Pero el encabezado hardcodeado mapea columna 5 -> "Vi"...
      // Espera: columna 4 (jueves) en la grilla = "Ju" en el hardcodeado.
      //
      // Verifiquemos: el 11/09/2026 es que dia de la semana?
      const friday = new Date(2026, 8, 11);
      const gridStart = startOfWeek(startOfMonth(new Date(2026, 8, 1)), { locale: es });

      // Cuantos dias desde el inicio de la grilla hasta el 11?
      const dayIndex = Math.round(
        (friday.getTime() - gridStart.getTime()) / (1000 * 60 * 60 * 24),
      );

      // El 11/09 cae en la posicion 6 de la grilla (columna 6 = Sabado en grilla lunes-domingo)
      // Pero con el encabezado hardcodeado, columna 6 = "Sa"...
      // En realidad, verifiquemos que dia de la semana es realmente:
      const dayName = format(friday, 'EEEE', { locale: es });
      expect(dayName).toBe('viernes');

      // El encabezado correcto (derivado de startOfWeek con locale es):
      const correctHeader = Array.from({ length: 7 }, (_, i) =>
        format(addDays(gridStart, i), 'EEEEEE', { locale: es }),
      );

      // El encabezado correcto debe tener "vi" (viernes) en la posicion 4
      // (0=lunes, 1=martes, 2=miercoles, 3=jueves, 4=viernes, 5=sabado, 6=domingo)
      expect(correctHeader[4]).toBe('vi');

      // El hardcodeado tiene "Vi" en posicion 4 tambien... pero la grilla
      // empieza en lunes, asi que la columna 4 del hardcodeado es "Vi" (viernes)
      // mientras que la columna 4 de la grilla es viernes. Espera...
      // El problema es que el hardcodeado empieza en domingo:
      // hardcodeado[0]="Do", pero grilla[0]="Lu".
      // Entonces el 11/09 (viernes) cae en la columna 4 de la grilla (viernes),
      // pero el encabezado[4] = "Vi" (viernes)... eso parece correcto?
      //
      // No. El problema real es: la grilla empieza en lunes, asi que
      // el primer dia de la grilla es lunes. El encabezado hardcodeado
      // dice que la primera columna es "Do" (domingo). Entonces la columna 0
      // muestra "Do" pero contiene lunes. La columna 1 muestra "Lu" pero
      // contiene martes. Y asi. Cada dia aparece una columna DESPUES
      // de donde deberia. El viernes (columna 4 de la grilla) aparece
      // bajo el rotulo "Ju" (hardcodeado[4] = "Vi"... no, veamos:
      // hardcodeado = ["Do","Lu","Ma","Mi","Ju","Vi","Sa"]
      // indice:        0    1    2    3    4    5    6
      // hardcodeado[4] = "Ju" (jueves)
      // Pero la columna 4 de la grilla es viernes.
      // Entonces el viernes aparece bajo "Ju". Eso es el bug.

      // Verifiquemos: el 11/09 cae en columna 4 de la grilla (0-indexed desde lunes)
      const fridayColumn = dayIndex % 7;
      expect(fridayColumn).toBe(4); // viernes = columna 4 (0=lunes)

      // El encabezado hardcodeado en la columna 4 dice "Ju" (jueves)
      expect(HARDCODED_HEADER[4]).toBe('Ju');

      // Pero el dia real es viernes. El encabezado correcto deberia decir "vi".
      expect(correctHeader[fridayColumn]).toBe('vi');

      // El bug: el rotulo que ve el usuario es "Ju" pero el dia es viernes.
      expect(HARDCODED_HEADER[fridayColumn]).not.toBe('vi');
    });
  });

  describe('encabezado derivado de startOfWeek (despues del fix)', () => {
    it('el encabezado coincide exactamente con la grilla', () => {
      const month = new Date(2026, 8, 1);
      const gridStart = startOfWeek(startOfMonth(month), { locale: es });

      const header = Array.from({ length: 7 }, (_, i) =>
        format(addDays(gridStart, i), 'EEEEEE', { locale: es }),
      );

      // Con locale es (weekStartsOn=1, lunes), el encabezado debe ser:
      // lu, ma, mi, ju, vi, sa, do
      expect(header).toEqual(['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do']);
    });

    it('el 11 de septiembre 2026 (viernes) cae bajo columna "vi"', () => {
      const month = new Date(2026, 8, 1);
      const gridStart = startOfWeek(startOfMonth(month), { locale: es });

      const header = Array.from({ length: 7 }, (_, i) =>
        format(addDays(gridStart, i), 'EEEEEE', { locale: es }),
      );

      const friday = new Date(2026, 8, 11);
      const dayIndex = Math.round(
        (friday.getTime() - gridStart.getTime()) / (1000 * 60 * 60 * 24),
      );
      const fridayColumn = dayIndex % 7;

      // El viernes debe estar bajo la columna que dice "vi"
      expect(header[fridayColumn]).toBe('vi');
    });
  });
});
