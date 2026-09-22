/**
 * F4 — `maskSensitiveForLlm` (callAnalysisRules): la batería COMPLETA de las
 * seis versiones del enmascarado, en un solo sitio. Consolidado el 2026-09-21
 * a partir de `f4Round6Builder` (D1-D3, que ya absorbía r2 R25-R33, r3 T8-T10,
 * r4 B4-B8/U1-U7 y r5 C1-C3/V1-V4), `f4Round6Tester` (W4), `f4Round7Builder`
 * (E1, E1b, E1c, E2, E2b) y `f4Round5Tester` (V5).
 *
 * Tres bloques: ACIERTOS (lo que debe ocultarse), FALSOS POSITIVOS (frases
 * comerciales que deben quedar intactas) y LÍMITES DECLARADOS (lo que la
 * heurística NO cubre, fijado por prueba para que nadie la declare «cerrada»).
 * Puro: sin mocks, red ni BD.
 */
import fs from 'fs';
import path from 'path';
import { maskSensitiveForLlm } from '@/lib/services/crm/callAnalysisRules';

const masked = (s: string) => maskSensitiveForLlm(s).includes('[OCULTO]');
const intactas = (frases: string[]) => { for (const f of frases) expect(maskSensitiveForLlm(f)).toBe(f); };

describe('ACIERTOS: lo que cada versión exigía ocultar se sigue ocultando', () => {
  it('D1 · tarjetas (guiones, espacios, puntos y partidas entre dos líneas) dejan los 4 últimos y conservan los saltos', () => {
    expect(maskSensitiveForLlm('mi tarjeta es 4111-1111-1111-1111')).toBe('mi tarjeta es [TARJETA ****1111]');
    expect(maskSensitiveForLlm('4539 1488 0343 6467 por favor')).toBe('[TARJETA ****6467] por favor');
    expect(maskSensitiveForLlm('anota 4111.1111.1111.1111')).toBe('anota [TARJETA ****1111]');
    const partida = maskSensitiveForLlm('[00:10] [CLIENTE]: 4111 1111\n[00:12] [CLIENTE]: 1111 1111');
    expect(partida).toContain('[TARJETA ****1111]');
    expect(partida).not.toMatch(/4111\s*1111\s*1111\s*1111/);
    expect(partida).toContain('\n');
  });

  it('D1 · palabras FUERTES (cvv, código de seguridad, pin, otp) + dígitos cortos', () => {
    expect(maskSensitiveForLlm('cvv: 123')).toBe('cvv: [OCULTO]');
    expect(maskSensitiveForLlm('el cvv es 123')).toBe('el cvv es [OCULTO]');
    expect(maskSensitiveForLlm('el código de seguridad es 4321')).toBe('el código de seguridad es [OCULTO]');
    expect(maskSensitiveForLlm('el pin de mi tarjeta es 4321')).toBe('el pin de mi tarjeta es [OCULTO]');
    expect(maskSensitiveForLlm('el otp es 123456')).toBe('el otp es [OCULTO]');
  });

  it('D1 · credenciales alfanuméricas tras clave/contraseña, con palabras sueltas o dos puntos por medio', () => {
    expect(maskSensitiveForLlm('La clave de acceso es Secreta99')).toBe('La clave de acceso es [OCULTO]');
    expect(maskSensitiveForLlm('la contraseña es Secreta99')).toBe('la contraseña es [OCULTO]');
    expect(maskSensitiveForLlm('mi clave personal es Sol2024')).toBe('mi clave personal es [OCULTO]');
    expect(maskSensitiveForLlm('la clave, apúntala bien, es Ana1990')).toBe('la clave, apúntala bien, es [OCULTO]');
    expect(maskSensitiveForLlm('la contraseña que usamos siempre es Verano2025')).toBe('la contraseña que usamos siempre es [OCULTO]');
    expect(maskSensitiveForLlm('Apunta la contraseña: Sol2024')).toBe('Apunta la contraseña: [OCULTO]');
    expect(maskSensitiveForLlm('la clave del wifi es Sol2024')).toBe('la clave del wifi es [OCULTO]');
  });

  it('D1b/D1c/D1d · los sustantivos «de credencial» (router, sistema, red, Wi-Fi…) no cortan la búsqueda; «palabra clave DE ACCESO» sí es credencial', () => {
    const frases = [
      'la clave del router es Admin2024', 'la clave del sistema es Sol2024', 'la clave del portal es Verano2025', 'la clave de la red es Ana1990',
      'la clave de la plataforma es Secreta99', 'la clave del modem es Casa2020', 'la clave de ingreso es Sol2024', 'la clave de login es Sol2024',
      'la clave del Wi-Fi es Sol2024', 'la clave del wi-fi es Sol2024', 'la palabra clave de acceso es Verano2025', 'la palabra clave del wifi es Sol2024',
    ];
    expect(frases.filter(masked)).toEqual(frases);
  });

  it('E1/E1c · el PLURAL de los sustantivos de credencial se oculta igual que el singular (derivado, no caso por caso)', () => {
    const frases = [
      'la clave de los sistemas es Sol2024', 'la clave de las cuentas es Sol2024', 'la clave de los usuarios es Sol2024', 'la clave de las redes es Sol2024',
      'la clave de los accesos es Sol2024', 'la clave de los portales es Sol2024', 'la contraseña de los sistemas es Sol2024', 'la contraseña de las cuentas es Sol2024',
      'el pin de las tarjetas es 4321', 'la clave de los routers es Admin2024', 'la clave de las plataformas es Sol2024',
      'la clave del sistema es Sol2024', 'la contraseña de la cuenta es Sol2024', 'el pin de la tarjeta es 4321',
    ];
    expect(frases.filter(masked)).toEqual(frases);
    // La lista hermana (cabezas adjetivas) también deriva el plural: «momentos» protegía sólo en singular.
    expect(masked('el momento clave es Pro2026')).toBe(false);
    expect(masked('los momentos clave son Pro2026')).toBe(false);
    expect(masked('los factores clave son Pro2026')).toBe(false);
    expect(masked('las ideas clave son Fase2')).toBe(false);
  });

  it('W4 · variantes ortográficas, mayúsculas, «para el», «acceso al», prefijo de transcripción y DOS secretos en la misma línea', () => {
    for (const s of [
      'LA CLAVE DEL ROUTER ES Admin2024', 'la clave del WiFi es Sol2024', 'la clave de la Wi Fi es Sol2024', 'la clave para el router es Admin2024',
      'la clave de acceso al portal es Sol2024', 'te paso la clave del router: Admin2024', 'la clave del router, apuntala, es Admin2024',
      'la clave de acceso es Niño2024', '[00:10] [CLIENTE]: la clave del router es Admin2024',
    ]) expect(masked(s)).toBe(true);
    expect(maskSensitiveForLlm('la clave de acceso es Sol2024 y la contraseña del correo es Luna2025')).toBe('la clave de acceso es [OCULTO] y la contraseña del correo es [OCULTO]');
  });
});

describe('FALSOS POSITIVOS: nada de lo que cada versión destrozaba se toca ya', () => {
  it('D2 · frases comerciales con «clave», cifras, años, productos, normas y el contexto que el análisis necesita', () => {
    intactas([
      // r2 (frases comerciales con «clave»).
      'La clave del negocio es el servicio', 'La clave está en el precio', 'El factor clave para cerrar es la garantía',
      // r3 (cifras y años tras «clave»).
      'La clave es 20000000 al mes', 'El dato clave es 2026', 'la clave del trimestre es 15 por ciento', 'el factor clave son 30000 pesos',
      'La clave está en el precio, cerramos por 45000 pesos', 'la clave es 1234567',
      // r4 (productos, normas y cifras sin unidad), con y sin tilde.
      'La clave del negocio es el iPhone16', 'el factor clave fue el plan Pro2026', 'la clave del proyecto es Fase2', 'la clave del éxito es Windows11',
      'la clave del exito es Windows11', 'nuestro código de seguridad interno es ISO9001', 'nuestro codigo de seguridad interno es ISO9001',
      'la clave está en el Modelo3 que vende más', 'el número clave es 150000', 'el numero clave es 150000', 'la cifra clave es 4500',
      'la clave es 300000, lo hablamos mañana',
      // Contexto que el análisis necesita (nombre, empresa, importe, teléfono, referencia que no pasa Luhn).
      'la referencia 1234567890123456', 'Habla Ana Ruiz de Acme, el presupuesto es 20000000 y el teléfono 3001234567',
      '[00:00] [AGENTE]: Hola Ana Ruiz de Acme, hablamos de 20000000 COP al 3001112233',
      // r6: los sustantivos de credencial no abren la vía de sólo dígitos ni tocan frases sin valor alfanumérico.
      'la clave del sistema es 150000', 'la clave de la plataforma es el servicio', 'la palabra clave del negocio es el iPhone16',
      'nuestras palabras clave son marketing y ventas', 'la cifra clave del sistema es 150000', 'el numero clave de la red es 4500',
      // r7: frases comerciales en plural.
      'la clave de los negocios es el iPhone16', 'la clave de los proyectos es Fase2',
      // Cabeza adjetiva sin genitivo de credencial sigue protegiendo.
      'el punto clave del negocio es el iPhone16', 'el dato clave del proyecto es Fase2',
    ]);
  });
});

describe('LÍMITES DECLARADOS L1-L12 y falsos positivos VIVOS: lo que la heurística NO cubre, fijado por prueba', () => {
  it('D3 · L1-L7: sólo letras, sólo dígitos largos, valor antes de la palabra, fin de frase, ventana de 6 palabras, palabra ajena por medio', () => {
    intactas([
      'la clave es Girasol', 'la contraseña es girasol', // L1
      'la clave es 1234567', // L2
      'mi contraseña es 987654321', 'el pin de la app es 1234567890', // L3
      'Sol2024 es mi clave', // L4
      'Te digo el pin. Es 4321', // L5
      'la clave que te dije por teléfono el otro día es Sol2024', // L6
      'nuestra clave interna es Sol2024', // L7
    ]);
    expect(maskSensitiveForLlm('anota 4321, ese es el pin de la tarjeta')).toContain('4321'); // L4
  });

  it('D3 · L8-L11: producto sin genitivo, «palabra clave» sin genitivo de credencial, separadores dentro del valor, «numero» no es conector', () => {
    expect(maskSensitiveForLlm('la clave es el iPhone16')).toBe('la clave es el [OCULTO]'); // L8: FP vivo
    intactas([
      'mi palabra clave es Sol2024', // L9: «keyword» (SEO)
      'mi contraseña es Sol-2024', 'mi contraseña es Sol_2024', 'mi contraseña es Sol.2024', 'la clave de acceso es Sol 2024', // L10
      'el pin es el numero 4321', // L11
    ]);
  });

  it('D3/E2b · L12: el genitivo de credencial manda sobre la cabeza adjetiva y arrastra el valor alfanumérico si no hay palabra ajena por medio', () => {
    for (const s of [
      'la clave del sistema es Windows11', 'la clave de la plataforma es Pro2026',
      'el tema clave de la cuenta es Premium2024', 'la idea clave de la red es Fibra600', 'el punto clave del portal es Magento2',
      'el codigo de seguridad del sistema es ISO9001', 'el codigo de seguridad de la red es ISO9001',
    ]) expect(masked(s)).toBe(true);
    // Con una palabra ajena por medio el corte de L7 lo salva igualmente.
    intactas(['la clave de la plataforma es el modulo Pro2026']);
  });

  it('V5 · FP VIVO: «la clave es que … <producto alfanumérico>» sigue destruyendo el producto', () => {
    expect(masked('la clave es que el Galaxy24 se vende solo')).toBe(true);
    expect(masked('la clave es que usamos el Modelo3 en toda la flota')).toBe(true);
  });

  it('E2 · CONTRATO sobre el docblock: ya no afirma que «clave» se descarte entera por la cabeza adjetiva y documenta L12 con el ejemplo del tester', () => {
    const doc = fs.readFileSync(path.resolve(__dirname, '../callAnalysisRules.ts'), 'utf8').replace(/\n\s*\*\s?/g, ' ').replace(/\s+/g, ' ');
    expect(doc).not.toContain('se descarta entera cuando la frase la usa como adjetivo');
    expect(doc).toContain('el genitivo de credencial manda sobre la cabeza adjetiva');
    expect(doc).toContain('el tema clave de la cuenta es Premium2024');
  });
});
