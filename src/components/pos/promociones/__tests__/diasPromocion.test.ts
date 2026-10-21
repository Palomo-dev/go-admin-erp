import { diasDelIdioma } from '../diasPromocion';

describe('dias de la promo', () => {
  it('empieza en lunes en español y francés, y el español conserva Lun y Lunes', () => {
    for (const locale of ['es', 'fr']) {
      expect(diasDelIdioma(locale).map((d) => d.value)[0]).toBe('monday');
    }
    const es = diasDelIdioma('es');
    expect(es.map((d) => d.corto)).toEqual(['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']);
    expect(es.map((d) => d.largo)).toEqual(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']);
  });

  it('empieza en domingo en inglés y portugués', () => {
    expect(diasDelIdioma('en').map((d) => d.value)[0]).toBe('sunday');
    expect(diasDelIdioma('pt').map((d) => d.value)[0]).toBe('sunday');
    expect(diasDelIdioma('en')[0].largo).toBe('Sunday');
    expect(diasDelIdioma('pt')[0].largo).toBe('Domingo');
    expect(diasDelIdioma('fr')[0].largo).toBe('Lundi');
  });
});
