/**
 * Widget del sitio web (diseños aprobados 94-chat-recuperado-canales 14 a 24):
 * qué archivo se puede borrar al quitar o cambiar, color libre (HSV ↔ hex y
 * contraste AA con el ícono) y el resumen de «Vista previa del botón».
 */
import { rutaEnBucket } from '@/components/common/subidaImagenLogica';
import {
  ESTILO_POR_DEFECTO,
  carpetaDelWidget,
  contraste,
  formatoDeImagen,
  hexAHsv,
  hsvAHex,
  nombreDeArchivoWidget,
  normalizarHex,
  resumenBoton,
  rutaPropiaDelWidget,
  tamanoArchivo,
} from '../website/id/widgetLogica';

const SUPABASE = 'https://proyecto.supabase.co';
const ruta = (url: string, bucket: string) => rutaEnBucket(url, bucket, SUPABASE);
const publica = (r: string) => `${SUPABASE}/storage/v1/object/public/logos/${r}`;

describe('archivos propios del widget (decisión 7: solo esos se borran)', () => {
  it('lo subido por el widget de la organización se puede borrar', () => {
    const carpeta = carpetaDelWidget(120, 'canal-1');
    expect(carpeta).toBe('120/chat-widget/canal-1');
    expect(rutaPropiaDelWidget(publica(`${carpeta}/logo-1731600000000-logo-tienda.png`), 120, ruta)).toBe(`${carpeta}/logo-1731600000000-logo-tienda.png`);
  });
  it('nunca el logo de la organización, otra organización ni un enlace externo', () => {
    expect(rutaPropiaDelWidget(publica('120/logo.png'), 120, ruta)).toBeNull();
    expect(rutaPropiaDelWidget(publica('121/chat-widget/c/logo-1-a.png'), 120, ruta)).toBeNull();
    expect(rutaPropiaDelWidget(publica('1200/chat-widget/c/logo-1-a.png'), 120, ruta)).toBeNull();
    expect(rutaPropiaDelWidget('https://tiendaejemplo.com/logo.png', 120, ruta)).toBeNull();
    expect(rutaPropiaDelWidget(publica('120/chat-widget/c/logo-1-a.png'), null, ruta)).toBeNull();
    expect(rutaPropiaDelWidget('', 120, ruta)).toBeNull();
  });
  it('nombre, formato y peso para la lista', () => {
    expect(nombreDeArchivoWidget('120/chat-widget/c/icono-1731600000000-icono-chat.png')).toBe('icono-chat.png');
    expect(formatoDeImagen('image/svg+xml')).toBe('SVG');
    expect(formatoDeImagen('image/jpeg')).toBe('JPG');
    expect(formatoDeImagen('https://x.co/a.webp?v=2')).toBe('WEBP');
    expect(tamanoArchivo(86016)).toBe('84 KB');
    expect(tamanoArchivo(3.4 * 1024 * 1024)).toBe('3,4 MB');
  });
});

describe('color libre', () => {
  it('hex → HSV → hex conserva el color', () => {
    for (const c of ['#0F766E', '#4361EE', '#FFFFFF', '#000000', '#EF4444']) expect(hsvAHex(hexAHsv(c))).toBe(c);
  });
  it('normaliza lo escrito y descarta lo inválido', () => {
    expect(normalizarHex('0f766e')).toBe('#0F766E');
    expect(normalizarHex('#0F76')).toBeNull();
  });
  it('contraste WCAG con el ícono blanco (#0F766E ≈ 5,5:1, AA)', () => {
    expect(contraste('#0F766E', '#FFFFFF')).toBeCloseTo(5.5, 1);
    expect(contraste('#FFFFFF', '#FFFFFF')).toBe(1);
    expect(contraste('#000000', '#FFFFFF')).toBe(21);
  });
});

describe('resumen de «Vista previa del botón»', () => {
  it('por defecto con borde blanco: «56 px · redondeo 28 · borde 2 px blanco · sombra media»', () => {
    expect(resumenBoton({ ...ESTILO_POR_DEFECTO, borderWidth: 2 })).toEqual([
      { clave: 'tamano', px: 56 },
      { clave: 'redondeo', px: 28 },
      { clave: 'borde', px: 2, color: null },
      { clave: 'sombra', fuerza: 'medium' },
    ]);
  });
  it('relleno con borde de color y sombra fuerte', () => {
    expect(
      resumenBoton({ ...ESTILO_POR_DEFECTO, iconStyle: 'filled', borderRadius: 16, borderWidth: 4, borderColor: '#99f6e4', shadowStrength: 'strong' }),
    ).toEqual([
      { clave: 'tamano', px: 56 },
      { clave: 'relleno' },
      { clave: 'redondeo', px: 16 },
      { clave: 'borde', px: 4, color: '#99F6E4' },
      { clave: 'sombra', fuerza: 'strong' },
    ]);
  });
  it('imagen propia: sin relleno ni redondeo; sin borde ni sombra se dice', () => {
    expect(resumenBoton({ ...ESTILO_POR_DEFECTO, iconType: 'custom', iconStyle: 'filled', shadowEnabled: false })).toEqual([
      { clave: 'tamano', px: 56 },
      { clave: 'imagenPropia' },
      { clave: 'sinBorde' },
      { clave: 'sinSombra' },
    ]);
  });
});
