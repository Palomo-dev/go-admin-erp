import * as fs from 'fs';
import * as path from 'path';
import {
  CODIGOS_ERROR_REGLA,
  agruparPorRegla,
  camposDeRegla,
  coincideBusqueda,
  cuentaBloqueada,
  errorDeRegla,
  estadoHttpErrorRegla,
  falloCuentaEnRegla,
  filasInventario,
  type CuentaDePlan,
  type CuentaInvalida,
} from '../reglasContables';

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..');
const leer = (ruta: string) => fs.readFileSync(path.join(RAIZ, ruta), 'utf8');

const PLAN: CuentaDePlan[] = [
  { account_code: '1305', parent_code: null, is_active: true, es_movimiento: true },
  { account_code: '1435', parent_code: null, is_active: true, es_movimiento: false },
  { account_code: '14350501', parent_code: '1435', is_active: true, es_movimiento: true },
  { account_code: '4155', parent_code: null, is_active: true, es_movimiento: null },
  { account_code: '41559501', parent_code: '4155', is_active: true, es_movimiento: true },
  { account_code: '6135', parent_code: null, is_active: false, es_movimiento: true },
];

const regla = (cambios: Record<string, string | null>) => ({
  debit_account_code: '1305',
  credit_account_code: '14350501',
  tax_account_code: null,
  discount_account_code: null,
  ...cambios,
});

describe('falloCuentaEnRegla: mismo criterio que fn_cuenta_fallo_en_regla', () => {
  test('inexistente, inactiva y de título', () => {
    expect(falloCuentaEnRegla('14350101', PLAN)).toBe('cuenta_no_existe');
    expect(falloCuentaEnRegla('', PLAN)).toBe('cuenta_no_existe');
    expect(falloCuentaEnRegla('6135', PLAN)).toBe('cuenta_inactiva');
    expect(falloCuentaEnRegla('1435', PLAN)).toBe('cuenta_de_titulo');
  });

  test('una cuenta con hijas es título aunque es_movimiento venga en null', () => {
    expect(falloCuentaEnRegla('4155', PLAN)).toBe('cuenta_de_titulo');
  });

  test('un auxiliar de movimiento pasa', () => {
    expect(falloCuentaEnRegla('14350501', PLAN)).toBeNull();
    expect(falloCuentaEnRegla(' 1305 ', PLAN)).toBeNull();
  });
});

describe('cuentaBloqueada: solo lo que cambia', () => {
  test('una regla nueva valida débito y crédito', () => {
    expect(cuentaBloqueada(regla({ debit_account_code: '5235' }), null, PLAN))
      .toEqual({ lado: 'debito', cuenta: '5235', codigo: 'cuenta_no_existe' });
    expect(cuentaBloqueada(regla({ credit_account_code: '4155' }), null, PLAN))
      .toEqual({ lado: 'credito', cuenta: '4155', codigo: 'cuenta_de_titulo' });
  });

  test('impuesto y descuento son opcionales, pero si traen cuenta se validan', () => {
    expect(cuentaBloqueada(regla({ tax_account_code: '' }), null, PLAN)).toBeNull();
    expect(cuentaBloqueada(regla({ tax_account_code: '1435' }), null, PLAN)?.lado).toBe('impuesto');
    expect(cuentaBloqueada(regla({ discount_account_code: '9999' }), null, PLAN)?.lado).toBe('descuento');
  });

  test('una regla que ya venía mal se guarda si esa columna no cambia', () => {
    const anterior = regla({ debit_account_code: '14350101' });
    expect(cuentaBloqueada(anterior, anterior, PLAN)).toBeNull();
    expect(cuentaBloqueada({ ...anterior, credit_account_code: '1305' }, anterior, PLAN)).toBeNull();
  });

  test('cambiarla por otra inválida se bloquea', () => {
    const anterior = regla({ debit_account_code: '14350101' });
    expect(cuentaBloqueada({ ...anterior, debit_account_code: '1435' }, anterior, PLAN)?.codigo).toBe('cuenta_de_titulo');
  });
});

describe('camposDeRegla: lista blanca', () => {
  const completa = {
    name: 'Venta',
    source_type: 'sale',
    event_type: 'created',
    debit_account_code: '1305',
    credit_account_code: '41359501',
  };

  test('nunca deja pasar organization_id ni id', () => {
    const campos = camposDeRegla({ ...completa, organization_id: 999, id: 'x', created_at: 'y' }, 'crear');
    expect(campos).not.toHaveProperty('organization_id');
    expect(campos).not.toHaveProperty('id');
    expect(campos).not.toHaveProperty('created_at');
  });

  test('crear exige los campos obligatorios', () => {
    expect(camposDeRegla({ name: 'x' }, 'crear')).toBeNull();
    expect(camposDeRegla({ ...completa, name: '   ' }, 'crear')).toBeNull();
    expect(camposDeRegla(completa, 'crear')).toMatchObject({ name: 'Venta' });
  });

  test('actualizar acepta un solo campo y solo devuelve lo enviado', () => {
    expect(camposDeRegla({ is_active: false }, 'actualizar')).toEqual({ is_active: false });
    expect(camposDeRegla({ credit_account_code: ' 41359501 ' }, 'actualizar')).toEqual({ credit_account_code: '41359501' });
  });

  test('impuesto vacío llega como null', () => {
    expect(camposDeRegla({ tax_account_code: '' }, 'actualizar')).toEqual({ tax_account_code: null });
  });

  test('rechaza tipos que no son y cuerpos vacíos', () => {
    expect(camposDeRegla({ organization_id: 5 }, 'actualizar')).toBeNull();
    expect(camposDeRegla({ priority: 'alta' }, 'actualizar')).toBeNull();
    expect(camposDeRegla({ priority: 40000 }, 'actualizar')).toBeNull();
    expect(camposDeRegla({ is_active: 'no' }, 'actualizar')).toBeNull();
    expect(camposDeRegla({ conditions: [1] }, 'actualizar')).toBeNull();
    expect(camposDeRegla(null, 'crear')).toBeNull();
    expect(camposDeRegla([], 'crear')).toBeNull();
  });
});

describe('errorDeRegla: nunca el texto crudo de Postgres', () => {
  test('lee código, lado y cuenta del disparador', () => {
    expect(errorDeRegla({
      code: '22023',
      message: 'cuenta_no_existe: la cuenta 5235 no se puede usar en la regla',
      details: 'lado=debito;cuenta=5235',
    })).toEqual({ codigo: 'cuenta_no_existe', lado: 'debito', cuenta: '5235' });
  });

  test('acceso denegado es sin_permiso, lo desconocido no se filtra', () => {
    expect(errorDeRegla({ code: '42501', message: 'Acceso denegado a la organización' }).codigo).toBe('sin_permiso');
    expect(errorDeRegla({ code: 'XX', message: 'relation does not exist' }))
      .toEqual({ codigo: 'desconocido', lado: null, cuenta: null });
    expect(errorDeRegla(null).codigo).toBe('desconocido');
  });

  test('estado HTTP de cada código', () => {
    expect(estadoHttpErrorRegla('sin_permiso')).toBe(403);
    expect(estadoHttpErrorRegla('regla_no_encontrada')).toBe(404);
    expect(estadoHttpErrorRegla('cuenta_de_titulo')).toBe(422);
    expect(estadoHttpErrorRegla('desconocido')).toBe(500);
  });
});

describe('inventario en pantalla', () => {
  const invalida = (regla_id: string, lado: CuentaInvalida['lado']): CuentaInvalida => ({
    regla_id,
    lado,
    cuenta: '14350101',
    estado: 'inexistente',
    propuesta: '14350501',
    propuesta_nombre: 'Mercancías',
    evidencia: 'configuracion',
    usos_propuesta: 12,
  });

  test('agrupa por regla', () => {
    const grupos = agruparPorRegla([invalida('a', 'debito'), invalida('a', 'credito'), invalida('b', 'debito')]);
    expect(grupos.get('a')).toHaveLength(2);
    expect(grupos.get('b')).toHaveLength(1);
  });

  test('el CSV no lleva nombre de empresa ni reglas ajenas', () => {
    const filas = filasInventario(
      [{ id: 'a', name: 'Compra', source_type: 'purchase', event_type: 'created' }],
      [invalida('a', 'debito'), invalida('otra', 'debito')],
    );
    expect(filas).toEqual([['purchase', 'created', 'Compra', 'debito', '14350101', 'inexistente', '14350501', 'configuracion', 12]]);
  });

  test('busca por nombre y por cuenta', () => {
    const fila = { name: 'Venta de contado', debit_account_code: '1105', credit_account_code: '41359501', tax_account_code: null };
    expect(coincideBusqueda(fila, 'CONTADO')).toBe(true);
    expect(coincideBusqueda(fila, '4135')).toBe(true);
    expect(coincideBusqueda(fila, 'compra')).toBe(false);
    expect(coincideBusqueda(fila, '  ')).toBe(true);
  });
});

describe('la migración protege lo existente', () => {
  const SQL = leer('supabase/migrations/20261107100000_reglas_contables_cuentas_invalidas.sql');
  const ejecutable = SQL.split('\n').filter((linea) => !linea.trim().startsWith('--')).join('\n');

  test('no actualiza reglas en bloque: el único update está en el saneamiento de empresas nuevas', () => {
    const updates = ejecutable.match(/update\s+public\.accounting_rules/gi) ?? [];
    expect(updates).toHaveLength(1);
    expect(ejecutable).toMatch(/if exists \(select 1 from public\.journal_entries e where e\.organization_id = p_org\) then\s+return 0;/);
  });

  test('el disparador solo valida a los roles cliente y solo la columna que cambia', () => {
    expect(ejecutable).toContain("current_user not in ('authenticated', 'anon', 'service_role')");
    expect(ejecutable).toContain('v_lado.nuevo is not distinct from nullif(btrim(v_lado.anterior)');
  });

  test('el núcleo queda cerrado a clientes y lo público exige acceso', () => {
    expect(ejecutable).toMatch(/revoke all on function public\.fn_cuenta_fallo_en_regla\(integer, text\) from public, anon, authenticated/);
    expect(ejecutable).toMatch(/revoke all on function public\.fn_reglas_cuentas_invalidas\(integer\) from public, anon, authenticated/);
    expect(ejecutable).toMatch(/fn_assert_acceso_org\(p_organization_id\);\s+if not public\.fn_tiene_permiso\(p_organization_id, 'finance\.view'\)/);
  });

  test('el saneamiento nunca tumba el alta de una empresa', () => {
    expect(ejecutable).toMatch(/perform public\.fn_reglas_sanear_org_nueva\(new\.id\);\s+exception when others then/);
  });
});

describe('textos', () => {
  test.each(['es', 'en', 'fr', 'pt'])('%s tiene los códigos de error y el bloqueo', (idioma) => {
    const mensajes = JSON.parse(leer(`messages/${idioma}.json`)) as { reglasContables: { errores: Record<string, string>; bloqueo: Record<string, string> } };
    const rama = mensajes.reglasContables;
    for (const codigo of CODIGOS_ERROR_REGLA) {
      if (codigo.startsWith('cuenta_')) continue;
      expect(rama.errores[codigo]).toBeTruthy();
    }
    for (const clave of ['noExiste', 'inactiva', 'titulocuenta', 'irAlPlan', 'elegirOtra']) {
      expect(rama.bloqueo[clave]).toBeTruthy();
    }
  });
});
