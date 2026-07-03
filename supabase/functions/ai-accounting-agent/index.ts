import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

interface AgentRunRequest {
  organization_id: number;
  run_type: "daily_close" | "monthly_close" | "reconciliation" | "anomaly_detection" | "report_generation";
  period_start?: string;
  period_end?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body: AgentRunRequest = await req.json();
    const { organization_id, run_type, period_start, period_end } = body;

    if (!organization_id || !run_type) {
      return new Response(JSON.stringify({ error: "organization_id and run_type required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const today = new Date().toISOString().split("T")[0];
    const startDate = period_start || today;
    const endDate = period_end || today;

    // Create agent run record
    const { data: runRecord, error: runError } = await supabase
      .from("ai_agent_runs")
      .insert({
        organization_id,
        run_type,
        status: "running",
        period_start: startDate,
        period_end: endDate,
      })
      .select()
      .single();

    if (runError) {
      return new Response(JSON.stringify({ error: runError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    let entriesCreated = 0;
    let anomaliesFound = 0;
    const suggestions: any[] = [];

    // 1. Get accounting rules for the organization
    const { data: rules, error: rulesError } = await supabase
      .from("accounting_rules")
      .select("*")
      .eq("organization_id", organization_id)
      .eq("is_active", true)
      .order("priority", { ascending: true });

    if (rulesError) {
      await supabase.from("ai_agent_runs").update({
        status: "failed",
        error_message: rulesError.message,
        completed_at: new Date().toISOString(),
      }).eq("id", runRecord.id);
      return new Response(JSON.stringify({ error: rulesError.message }), { status: 500 });
    }

    // 2. Get unprocessed transactions based on run_type
    if (run_type === "daily_close" || run_type === "monthly_close") {
      // Process sales
      const { data: sales } = await supabase
        .from("invoice_sales")
        .select("id, total, tax_total, status, created_at")
        .eq("organization_id", organization_id)
        .gte("created_at", startDate)
        .lte("created_at", endDate + "T23:59:59")
        .neq("status", "draft");

      if (sales && sales.length > 0) {
        for (const sale of sales) {
          // Check if journal entry already exists for this sale
          const { data: existing } = await supabase
            .from("journal_entries")
            .select("id")
            .eq("organization_id", organization_id)
            .eq("source", "sale")
            .eq("source_id", sale.id)
            .eq("posted", true);

          if (existing && existing.length > 0) continue;

          // Find matching rule
          const rule = rules?.find(r => r.source_type === "sale" && r.event_type === "created");
          if (!rule) continue;

          // Create journal entry
          const { data: entry, error: entryError } = await supabase
            .from("journal_entries")
            .insert({
              organization_id,
              branch_id: 0,
              entry_date: sale.created_at,
              memo: `Venta - Factura ${sale.id}`,
              source: "sale",
              source_id: sale.id,
              posted: true,
            })
            .select()
            .single();

          if (entryError) continue;
          entriesCreated++;

          // Create journal lines
          const lines = [
            { journal_entry_id: entry.id, account_code: rule.debit_account_code, debit: sale.total - (sale.tax_total || 0), credit: 0, organization_id },
            { journal_entry_id: entry.id, account_code: rule.credit_account_code, debit: 0, credit: sale.total - (sale.tax_total || 0), organization_id },
          ];

          if (sale.tax_total && sale.tax_total > 0 && rule.tax_account_code) {
            lines.push({ journal_entry_id: entry.id, account_code: rule.tax_account_code, debit: 0, credit: sale.tax_total, organization_id });
            lines[0].debit = sale.total;
          }

          await supabase.from("journal_lines").insert(lines);
        }
      }

      // Process purchases
      const { data: purchases } = await supabase
        .from("invoice_purchase")
        .select("id, total, tax_total, status, created_at")
        .eq("organization_id", organization_id)
        .gte("created_at", startDate)
        .lte("created_at", endDate + "T23:59:59")
        .neq("status", "draft");

      if (purchases && purchases.length > 0) {
        for (const purchase of purchases) {
          const { data: existing } = await supabase
            .from("journal_entries")
            .select("id")
            .eq("organization_id", organization_id)
            .eq("source", "purchase")
            .eq("source_id", purchase.id)
            .eq("posted", true);

          if (existing && existing.length > 0) continue;

          const rule = rules?.find(r => r.source_type === "purchase" && r.event_type === "created");
          if (!rule) continue;

          const { data: entry } = await supabase
            .from("journal_entries")
            .insert({
              organization_id, branch_id: 0,
              entry_date: purchase.created_at,
              memo: `Compra - Factura ${purchase.id}`,
              source: "purchase", source_id: purchase.id, posted: true,
            })
            .select()
            .single();

          if (!entry) continue;
          entriesCreated++;

          const lines = [
            { journal_entry_id: entry.id, account_code: rule.debit_account_code, debit: purchase.total - (purchase.tax_total || 0), credit: 0, organization_id },
            { journal_entry_id: entry.id, account_code: rule.credit_account_code, debit: 0, credit: purchase.total - (purchase.tax_total || 0), organization_id },
          ];

          if (purchase.tax_total && purchase.tax_total > 0 && rule.tax_account_code) {
            lines.push({ journal_entry_id: entry.id, account_code: rule.tax_account_code, debit: 0, credit: purchase.tax_total, organization_id });
            lines[0].debit = purchase.total;
          }

          await supabase.from("journal_lines").insert(lines);
        }
      }
    }

    // 3. Anomaly detection
    if (run_type === "anomaly_detection" || run_type === "monthly_close") {
      // Check for unbalanced entries
      const { data: unbalanced } = await supabase.rpc("check_unbalanced_entries", {
        org_id: organization_id,
        start_date: startDate,
        end_date: endDate,
      }).throwOnError().catch(() => ({ data: null }));

      if (unbalanced && unbalanced.length > 0) {
        anomaliesFound += unbalanced.length;
        for (const u of unbalanced) {
          suggestions.push({
            organization_id,
            agent_run_id: runRecord.id,
            suggestion_type: "anomaly",
            title: `Asiento descuadrado #${u.entry_id}`,
            description: `Diferencia: ${u.difference}`,
            priority: "high",
            data: u,
          });
        }
      }

      // Check for accounts with unusual balances
      const { data: accounts } = await supabase
        .from("chart_of_accounts")
        .select("account_code, name, type")
        .eq("organization_id", organization_id)
        .eq("is_active", true);

      if (accounts) {
        // Check for negative asset balances (potential anomaly)
        for (const acc of accounts) {
          if (acc.type === "asset") {
            // This would require a balance calculation query
            // For now, just flag as a potential check
          }
        }
      }
    }

    // 4. Insert suggestions
    if (suggestions.length > 0) {
      await supabase.from("ai_agent_suggestions").insert(suggestions);
    }

    // 5. Update run record
    await supabase.from("ai_agent_runs").update({
      status: "completed",
      entries_created: entriesCreated,
      anomalies_found: anomaliesFound,
      summary: {
        rules_applied: rules?.length || 0,
        suggestions_generated: suggestions.length,
      },
      completed_at: new Date().toISOString(),
    }).eq("id", runRecord.id);

    return new Response(JSON.stringify({
      success: true,
      run_id: runRecord.id,
      entries_created: entriesCreated,
      anomalies_found: anomaliesFound,
      suggestions: suggestions.length,
    }), {
      headers: { "Content-Type": "application/json", "Connection": "keep-alive" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
