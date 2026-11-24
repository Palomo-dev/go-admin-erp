/**
 * Evidencias de entrega en el bucket privado `shipment-pod`: solo se firman rutas de la carpeta
 * `{organización}/{envío}/` (nunca otra organización, otro envío ni otro dominio).
 */
import { DURACION_ENLACE_EVIDENCIA, rutaEvidencia, valoresEvidencia } from '../evidencias';

const ORG = 120;
const ENVIO = '7d3c2a10-5b1e-4c55-9a6e-0f1e2d3c4b5a';
const OTRO = '11111111-2222-4333-8444-555555555555';

describe('rutaEvidencia', () => {
  test('acepta la ruta guardada del envío y la organización', () => {
    expect(rutaEvidencia(`${ORG}/${ENVIO}/foto-abc.jpg`, ORG, ENVIO)).toBe(`${ORG}/${ENVIO}/foto-abc.jpg`);
    expect(rutaEvidencia(`${ORG}/${ENVIO.toUpperCase()}/firma-1.png`, ORG, ENVIO)).toBe(`${ORG}/${ENVIO.toUpperCase()}/firma-1.png`);
  });

  test('acepta una URL vieja de Storage del mismo bucket (pública o firmada) y devuelve la ruta', () => {
    expect(rutaEvidencia(`https://x.supabase.co/storage/v1/object/public/shipment-pod/${ORG}/${ENVIO}/foto-a.jpg`, ORG, ENVIO)).toBe(`${ORG}/${ENVIO}/foto-a.jpg`);
    expect(rutaEvidencia(`https://x.supabase.co/storage/v1/object/sign/shipment-pod/${ORG}/${ENVIO}/foto-a.jpg?token=abc`, ORG, ENVIO)).toBe(`${ORG}/${ENVIO}/foto-a.jpg`);
  });

  test('rechaza otra organización, otro envío, otro bucket, otro dominio y rutas raras', () => {
    expect(rutaEvidencia(`999/${ENVIO}/foto.jpg`, ORG, ENVIO)).toBeNull();
    expect(rutaEvidencia(`${ORG}/${OTRO}/foto.jpg`, ORG, ENVIO)).toBeNull();
    expect(rutaEvidencia(`https://x.supabase.co/storage/v1/object/public/otro-bucket/${ORG}/${ENVIO}/f.jpg`, ORG, ENVIO)).toBeNull();
    expect(rutaEvidencia('https://rastreador.example/pixel.gif', ORG, ENVIO)).toBeNull();
    expect(rutaEvidencia(`${ORG}/${ENVIO}/../../otra/f.jpg`, ORG, ENVIO)).toBeNull();
    expect(rutaEvidencia(`${ORG}/${ENVIO}/.oculto`, ORG, ENVIO)).toBeNull();
    expect(rutaEvidencia(`deliveries/pod_1.jpg`, ORG, ENVIO)).toBeNull();
    expect(rutaEvidencia('', ORG, ENVIO)).toBeNull();
    expect(rutaEvidencia(null, ORG, ENVIO)).toBeNull();
  });
});

describe('valoresEvidencia', () => {
  test('junta firma, fotos de la prueba y fotos de los intentos sin repetir ni vacíos', () => {
    expect(
      valoresEvidencia(
        { signature_url: 'a', photo_urls: ['b', null, ''] },
        [{ photo_urls: ['c', 'b'] }, { photo_urls: null }],
      ),
    ).toEqual(['a', 'b', 'c']);
    expect(valoresEvidencia(null, null)).toEqual([]);
  });

  test('los enlaces duran poco (minutos, no días)', () => {
    expect(DURACION_ENLACE_EVIDENCIA).toBeGreaterThan(0);
    expect(DURACION_ENLACE_EVIDENCIA).toBeLessThanOrEqual(900);
  });
});
