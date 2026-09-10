/// <reference types="jest" />
/**
 * Prueba en vivo (solo con RUN_LIVE=1 y credenciales en .env.local): crea una
 * plantilla vía servicio en la org de prueba, la previsualiza, la duplica y
 * limpia. NO envía correos. Se elimina tras la ronda (no forma parte del CI).
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const RUN = process.env.RUN_LIVE === '1';
const ORG = Number(process.env.LIVE_ORG ?? '105');
const d = RUN ? describe : describe.skip;

function loadEnv() {
  const file = path.resolve(process.cwd(), '.env.local');
  const txt = fs.readFileSync(file, 'utf8');
  for (const line of txt.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
}

d('F7 live (org de prueba)', () => {
  jest.setTimeout(60000);
  beforeAll(() => loadEnv());

  it('crea, previsualiza, duplica y elimina una plantilla; siembra las 6 base si faltan', async () => {
    const { createTemplate, deleteTemplate, duplicateTemplate, ensureSeedTemplates, listTemplates, previewTemplate, updateTemplate } = await import('../templatesService');
    const { sampleContext } = await import('../variables');
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } });
    const name = `F7 live ${Date.now()}`;
    const seeded = await ensureSeedTemplates(ORG, null, sb);
    const list = await listTemplates(ORG, { channel: 'email' }, sb);
    expect(list.total).toBeGreaterThanOrEqual(6);
    const t = await createTemplate(ORG, null, {
      name, engine: 'blocks', kind: 'transactional', subject: 'Hola {{contact.first_name|hola}}', preheader: 'live',
      blocks_json: { version: 1, settings: {}, blocks: [{ id: 'h', type: 'header', props: {} }, { id: 't', type: 'text', props: { html: '<p>Hola {{contact.first_name|hola}} de {{org.name}}<script>x</script></p>' } }, { id: 's', type: 'signature', props: {} }, { id: 'f', type: 'footer_legal', props: {} }] },
    }, sb);
    const ids = [t.id];
    try {
      expect(t.engine).toBe('blocks');
      expect(t.version).toBe(1);
      expect(t.body_html).not.toContain('<script');
      expect(t.variables).toEqual(expect.arrayContaining(['contact.first_name', 'org.name']));
      const p = await previewTemplate(ORG, { template_id: t.id }, sampleContext(), sb);
      expect(p.subject).toBe('Hola Carlos');
      expect(p.html).toContain('Hola Carlos de ACME S.A.S');
      const u = await updateTemplate(ORG, null, t.id, { subject: 'Nuevo {{contact.first_name}}' }, sb);
      expect(u.version).toBe(2);
      const dup = await duplicateTemplate(ORG, null, t.id, undefined, sb);
      ids.push(dup.id);
      expect(dup.name).toBe(`${name} (copia)`);
      expect(dup.metadata.parent_template_id).toBe(t.id);
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ org: ORG, seeded, total_before: list.total, created: t.id, duplicated: dup.id, preview_subject: p.subject, missing: p.missing }));
    } finally {
      for (const id of ids) await deleteTemplate(ORG, id, sb).catch(() => undefined);
      const after = await sb.from('templates').select('id').eq('organization_id', ORG).in('id', ids);
      expect(after.data ?? []).toHaveLength(0);
    }
  });
});
