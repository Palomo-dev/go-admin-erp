/**
 * @jest-environment jsdom
 *
 * «Pago contra entrega» de Ventas en línea (Figma «05 POS y ventas» 01–03): la fila de la
 * tarjeta de métodos de pago y el diálogo de condiciones por sede. Organización ficticia.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { RespuestaContraentrega } from '@/lib/website/contraentregaSitio.server';
import { CONDICIONES_POR_DEFECTO, normalizarCondiciones } from '@/lib/contraentrega/reglaContraentrega';
import { DialogoContraentrega, envioGratisDeSede } from '../DialogoContraentrega';
import { FilaContraentrega, estadoFila, sedeInicialDe } from '../FilaContraentrega';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

function datos(extra: Partial<RespuestaContraentrega> = {}): RespuestaContraentrega {
  return {
    efectivo: { existe: true, activo: true, visibleWeb: true, nombre: 'Efectivo' },
    sedes: [
      { id: 1, nombre: 'Sucursal Principal', principal: true },
      { id: 2, nombre: 'Sede Norte', principal: false },
    ],
    condiciones: {},
    zonas: [
      { id: 'z1', nombre: 'Chapinero', branchId: 1, envioGratisDesde: 150000, domicilio: null },
      { id: 'z2', nombre: 'Zona Norte', branchId: 2, envioGratisDesde: null, domicilio: null },
      { id: 'z3', nombre: 'Zona Centro', branchId: null, envioGratisDesde: null, domicilio: null },
    ],
    pasarelas: [{ codigo: 'wompi_co', nombre: 'Wompi' }],
    categorias: [{ id: 7, nombre: 'Licores', descripcion: 'vinos, cervezas y aguardientes' }],
    productos: [],
    envioGratisDesde: null,
    moneda: { code: 'COP', decimals: 0, locale: 'es-CO' },
    permisos: { editar: true },
    ...extra,
  };
}

const figma = normalizarCondiciones({
  montoMinimo: 80000,
  montoMaximo: 600000,
  zonas: { modo: 'algunas', ids: ['z1', 'z3'] },
  productos: { modo: 'excepto', categorias: [7] },
  anticipo: { tipo: 'envio', pasarela: 'wompi_co' },
});

describe('fila «Pago contra entrega»', () => {
  it('sin condiciones: como hoy, con el botón «Condiciones»', () => {
    const onCondiciones = jest.fn();
    renderConIdioma(<FilaContraentrega datos={datos()} cargando={false} fallo={false} onCondiciones={onCondiciones} />);
    expect(screen.getByText('Sin condiciones')).toBeTruthy();
    expect(screen.getByText('Sin condiciones: se cobra todo al recibir')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Condiciones/ }));
    expect(onCondiciones).toHaveBeenCalled();
  });

  it('con condiciones en una sede: estado y resumen con el nombre de la sede', () => {
    const d = datos({ condiciones: { '2': figma } });
    expect(estadoFila(d)).toBe('con_condiciones');
    expect(sedeInicialDe(d)).toBe(2);
    renderConIdioma(<FilaContraentrega datos={d} cargando={false} fallo={false} onCondiciones={jest.fn()} />);
    expect(screen.getByText('Con condiciones')).toBeTruthy();
    expect(screen.getByText(/^Sede Norte: Desde .*80\.000 hasta .*600\.000 · 2 zonas · todo menos Licores · anticipo: el envío$/)).toBeTruthy();
  });

  it('sin el método Efectivo y sin permiso de editar', () => {
    const d = datos({ efectivo: { existe: false, activo: false, visibleWeb: false, nombre: null }, permisos: { editar: false } });
    expect(estadoFila(d)).toBe('sin_efectivo');
    renderConIdioma(<FilaContraentrega datos={d} cargando={false} fallo={false} onCondiciones={jest.fn()} />);
    expect(screen.queryByRole('button', { name: /Condiciones/ })).toBeNull();
  });
});

describe('diálogo de condiciones', () => {
  it('envío gratis: el del checkout o el menor de las zonas de la sede', () => {
    expect(envioGratisDeSede(datos(), 1)).toBe(150000);
    expect(envioGratisDeSede(datos(), 2)).toBeNull();
    expect(envioGratisDeSede(datos({ envioGratisDesde: 120000 }), 1)).toBe(120000);
  });

  it('guarda las condiciones de la sede elegida (nunca la organización)', async () => {
    const onGuardar = jest.fn().mockResolvedValue(undefined);
    renderConIdioma(
      <DialogoContraentrega abierto onAbiertoChange={jest.fn()} datos={datos()} sedeInicial={1} onGuardar={onGuardar} buscarProductos={jest.fn().mockResolvedValue([])} />,
    );
    expect(screen.getByText('Así lo ve tu cliente')).toBeTruthy();
    expect(screen.getByText('Resumen de las reglas')).toBeTruthy();
    // «Quién puede usarla»: las dos casillas vienen APAGADAS.
    expect(screen.getByRole('checkbox', { name: /Solo clientes con pedidos entregados/ }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('checkbox', { name: /No ofrecerla a quien rechazó/ }).getAttribute('aria-checked')).toBe('false');
    // Pedir anticipo: el envío por defecto, con el aviso de envío gratis de la sede.
    fireEvent.click(screen.getByRole('switch', { name: 'Pedir un anticipo en línea' }));
    expect(screen.getByText(/Tu tienda tiene envío gratis desde/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(onGuardar).toHaveBeenCalled());
    const [sede, condiciones] = onGuardar.mock.calls[0];
    expect(sede).toBe(1);
    expect(condiciones).toMatchObject({ ...CONDICIONES_POR_DEFECTO, anticipo: { ...CONDICIONES_POR_DEFECTO.anticipo, tipo: 'envio' } });
  });

  it('sin el método Efectivo no deja guardar y lleva a Finanzas', () => {
    renderConIdioma(
      <DialogoContraentrega
        abierto
        onAbiertoChange={jest.fn()}
        datos={datos({ efectivo: { existe: false, activo: false, visibleWeb: false, nombre: null } })}
        sedeInicial={1}
        onGuardar={jest.fn()}
        buscarProductos={jest.fn()}
      />,
    );
    expect(screen.getByText('Tu organización no tiene el método Efectivo')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('con condiciones guardadas ofrece quitarlas (la sede vuelve a como hoy)', async () => {
    const onGuardar = jest.fn().mockResolvedValue(undefined);
    renderConIdioma(
      <DialogoContraentrega abierto onAbiertoChange={jest.fn()} datos={datos({ condiciones: { '1': figma } })} sedeInicial={1} onGuardar={onGuardar} buscarProductos={jest.fn()} />,
    );
    expect(screen.getByText('Licores')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar condiciones de esta sede' }));
    await waitFor(() => expect(onGuardar).toHaveBeenCalledWith(1, null));
  });
});
