/**
 * Script temporal para reconciliar TODOS los pedidos web huérfanos (paid sin sale_id).
 * Ejecutar con: npx tsx scripts/reconcile-orphan-orders.ts
 *
 * Usa el mismo webOrderServerConfirmation.autoConfirmPaidOrder que el cron.
 * Procesa en lotes para evitar timeouts y mostrar progreso.
 */
// Cargar .env.local ANTES de cualquier import que use supabase config
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
for (const line of envContent.split(/\r?\n/)) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, '').trim();
  }
}

require('tsconfig-paths/register');

async function main() {
  const { webOrderServerConfirmation } = await import('../src/lib/services/webOrderServerConfirmation');
  const { createClient } = await import('@supabase/supabase-js');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Cargar TODOS los huérfanos
  const { data: orphans, error } = await supabase
    .from('web_orders')
    .select('id, order_number, organization_id, total, created_at')
    .eq('payment_status', 'paid')
    .is('sale_id', null)
    .not('status', 'in', '("cancelled","rejected","expired","refunded")')
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) {
    console.error('[reconcile] Error consultando huérfanos:', error);
    process.exit(1);
  }

  if (!orphans || orphans.length === 0) {
    console.log('[reconcile] No hay pedidos huérfanos. Todo OK.');
    return;
  }

  console.log(`[reconcile] ${orphans.length} pedido(s) huérfano(s) encontrado(s). Total: $${orphans.reduce((s, o) => s + Number(o.total), 0)}`);
  console.log('[reconcile] Procesando... (esto puede tardar varios minutos)\n');

  let ok = 0;
  let fail = 0;
  const failures: { order: string; error: string }[] = [];

  for (let i = 0; i < orphans.length; i++) {
    const o = orphans[i];
    try {
      const result = await webOrderServerConfirmation.autoConfirmPaidOrder(o.id);
      const stockWarn = result.stockErrors.length ? ` ⚠️${result.stockErrors.length} stock errors` : '';
      console.log(`[${i + 1}/${orphans.length}] ✅ ${o.order_number} ($${o.total}) → sale ${result.saleId.slice(0, 8)}${stockWarn}`);
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${i + 1}/${orphans.length}] ❌ ${o.order_number} ($${o.total}): ${msg}`);
      failures.push({ order: o.order_number, error: msg });
      fail++;
    }
  }

  console.log(`\n[reconcile] Listo: ${ok} OK, ${fail} fallos de ${orphans.length} total.`);
  if (failures.length > 0) {
    console.log('\n[reconcile] Fallos:');
    for (const f of failures) {
      console.log(`  - ${f.order}: ${f.error}`);
    }
  }
}

main().catch((e) => {
  console.error('[reconcile] Error fatal:', e);
  process.exit(1);
});
