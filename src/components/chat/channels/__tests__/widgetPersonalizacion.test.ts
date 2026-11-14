/**
 * Personalización del chat del sitio web restaurada el 2026-11-14 (márgenes,
 * logo, estilo, vista inicial, botones con enlace). La pantalla y el widget
 * público deben leer lo mismo: se compara con `normalizarConfiguracion`.
 */
import {
  ESTILO_POR_DEFECTO,
  botonAbreEnlace,
  botonRapido,
  configuracionDelWidget,
  entreLimites,
  esUrlImagenValida,
  LIMITES_WIDGET,
  sombraDelBoton,
} from '../website/id/widgetLogica';
import { normalizarConfiguracion } from '../../../../../supabase/functions/_shared/chat-widget/reglas';

describe('configuración del widget en la pantalla', () => {
  it('sin nada guardado usa los mismos valores por defecto que el widget público', () => {
    const c = configuracionDelWidget(null, null);
    const publica = normalizarConfiguracion(null, null, null);
    expect(c.style.primaryColor).toBe(publica.estilo.colorPrincipal);
    expect(c.behavior.title).toBe(publica.titulo);
    expect(c.behavior.welcomeMessage).toBe(publica.bienvenida);
    expect(c.behavior.offlineMessage).toBe(publica.fueraDeHorario.mensaje);
    expect(c.position).toEqual({ side: 'right', vertical: 'bottom', offsetX: publica.posicion.x, offsetY: publica.posicion.y });
    expect(c.style.buttonSize).toBe(publica.estilo.tamano);
    expect(c.logo_url).toBeUndefined();
  });

  it('conserva los márgenes guardados y entiende la forma antigua', () => {
    const c = configuracionDelWidget({ position: { side: 'left', vertical: 'top', offsetX: 64, offsetY: 120 } }, null);
    expect(c.position).toEqual({ side: 'left', vertical: 'top', offsetX: 64, offsetY: 120 });
    const antigua = configuracionDelWidget({ position: 'bottom-left', primary_color: '#10B981', logo_url: 'https://x.co/l.png' }, 'Hola');
    expect(antigua.position.side).toBe('left');
    expect(antigua.style.primaryColor).toBe('#10B981');
    expect(antigua.logo_url).toBe('https://x.co/l.png');
    expect(antigua.behavior.welcomeMessage).toBe('Hola');
  });

  it('lo que guarda la pantalla lo lee igual el widget público', () => {
    const c = configuracionDelWidget(
      {
        position: { side: 'left', vertical: 'bottom', offsetX: 40, offsetY: 90 },
        style: { ...ESTILO_POR_DEFECTO, iconType: 'support', borderWidth: 3, shadowEnabled: false },
        behavior: { openDefaultView: 'faq', showQuickActions: true, quickActions: [botonRapido('Envíos', 'https://tienda.co/envios')] },
        logo_url: 'https://tienda.co/logo.png',
      },
      null,
    );
    const publica = normalizarConfiguracion(c, null, null);
    expect(publica.posicion).toEqual({ lado: 'left', vertical: 'bottom', x: 40, y: 90 });
    expect(publica.estilo.icono).toBe('support');
    expect(publica.estilo.borde).toBe(3);
    expect(publica.estilo.sombra).toBe('none');
    expect(publica.vistaInicial).toBe('faq');
    expect(publica.acciones).toEqual([{ etiqueta: 'Envíos', accion: 'https://tienda.co/envios', url: 'https://tienda.co/envios' }]);
    expect(publica.avatar).toBe('https://tienda.co/logo.png');
  });

  it('descarta un logo que el widget no mostraría', () => {
    expect(configuracionDelWidget({ logo_url: 'javascript:alert(1)' }, null).logo_url).toBeUndefined();
    expect(esUrlImagenValida('')).toBe(true);
    expect(esUrlImagenValida('http://x.co/a.png')).toBe(false);
    expect(esUrlImagenValida('https://x.co/a.png')).toBe(true);
  });
});

describe('reglas de los controles', () => {
  it('limita márgenes, tamaño, redondeo y borde como el widget', () => {
    expect(entreLimites(250, LIMITES_WIDGET.margen, 20)).toBe(200);
    expect(entreLimites(-5, LIMITES_WIDGET.margen, 20)).toBe(0);
    expect(entreLimites(null, LIMITES_WIDGET.margen, 20)).toBe(20);
    expect(entreLimites('33.6', LIMITES_WIDGET.tamano, 56)).toBe(40);
    expect(entreLimites(99, LIMITES_WIDGET.borde, 0)).toBe(6);
  });

  it('un botón rápido sin mensaje envía su texto; con https abre el enlace', () => {
    expect(botonRapido(' Horarios ', '')).toEqual({ label: 'Horarios', action: 'Horarios' });
    expect(botonRapido('Envíos', '¿Cuánto tarda?')).toEqual({ label: 'Envíos', action: '¿Cuánto tarda?' });
    expect(botonAbreEnlace('https://tienda.co')).toBe(true);
    expect(botonAbreEnlace('¿Cuánto tarda?')).toBe(false);
  });

  it('la sombra del botón es la del widget público', () => {
    expect(sombraDelBoton({ shadowEnabled: false, shadowStrength: 'strong' })).toBe('none');
    expect(sombraDelBoton({ shadowEnabled: true, shadowStrength: 'light' })).toBe('0 2px 8px rgba(0,0,0,.15)');
  });
});
