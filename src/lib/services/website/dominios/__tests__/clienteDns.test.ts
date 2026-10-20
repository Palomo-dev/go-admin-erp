import { crearClienteDns, ErrorVercel } from '../vercelDominios';

const cfg = { token: 'tok', teamId: 'team_test' };

function respuesta(status: number, cuerpo: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => cuerpo } as Response;
}

describe('DNS de Vercel para el correo', () => {
  test('lista los registros y crea MX con prioridad, sin pisar un duplicado', async () => {
    const llamadas: Array<{ url: string; metodo: string; cuerpo: unknown }> = [];
    const f = jest.fn(async (url: string, init?: RequestInit) => {
      llamadas.push({ url, metodo: init?.method ?? 'GET', cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (init?.method === 'POST') return respuesta(409, { error: { code: 'conflict', message: 'already exists' } });
      return respuesta(200, { records: [{ id: '1', name: 'send', type: 'MX', value: 'feedback.example.com', mxPriority: 10 }] });
    });
    const dns = crearClienteDns(cfg, f as unknown as typeof fetch);
    await expect(dns.listar('tumarca.co')).resolves.toEqual([{ name: 'send', type: 'MX', value: 'feedback.example.com', mxPriority: 10 }]);
    await expect(dns.crear('tumarca.co', { name: 'send', type: 'MX', value: 'feedback.example.com', mxPriority: 10 })).resolves.toBeUndefined();
    expect(llamadas[0].url).toContain('/v2/domains/tumarca.co/records?limit=100');
    expect(llamadas[0].url).toContain('teamId=team_test');
    expect(llamadas[1]).toMatchObject({
      metodo: 'POST',
      cuerpo: { name: 'send', type: 'MX', value: 'feedback.example.com', mxPriority: 10 },
    });
  });

  test('un 404 al listar no se disfraza de zona vacía', async () => {
    const f = jest.fn(async () => respuesta(404, { error: { message: 'not found' } }));
    const dns = crearClienteDns(cfg, f as unknown as typeof fetch);
    await expect(dns.listar('tumarca.co')).rejects.toBeInstanceOf(ErrorVercel);
  });
});
