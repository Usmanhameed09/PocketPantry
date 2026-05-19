/**
 * Distribute a Received PO's units to machines. Creates a refill_event +
 * refill_lines + stock_movements (warehouse -, machine +) for each line.
 *
 * Body: { distributions: [{ machineId, productId, qty }] }
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { recordStockMovement } from "@/lib/inventory-ledger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Distribution = { machineId: string; productId: string; qty: number };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: poId } = await ctx.params;
    const body = await req.json();
    const distributions = (body.distributions || []) as Distribution[];
    const operator = body.operator || null;

    if (distributions.length === 0) {
      return NextResponse.json({ success: false, error: "No distributions" }, { status: 400 });
    }

    const supabase = createServerClient();

    // Group distributions by machine — one refill_event per machine
    const byMachine = new Map<string, Distribution[]>();
    for (const d of distributions) {
      if (d.qty <= 0) continue;
      const arr = byMachine.get(d.machineId) || [];
      arr.push(d);
      byMachine.set(d.machineId, arr);
    }

    let refillsCreated = 0;
    let unitsMoved = 0;

    for (const [machineId, items] of byMachine.entries()) {
      // Create refill_event
      const { data: refill, error: rErr } = await supabase
        .from("refill_events")
        .insert({ machine_id: machineId, performed_by: operator, notes: `From PO ${poId.slice(0, 8)}` })
        .select("id")
        .single();
      if (rErr) throw new Error(`refill_event: ${rErr.message}`);

      // Create refill_lines
      const lineRows = items.map((i) => ({
        refill_id: refill.id,
        product_id: i.productId,
        qty_loaded: i.qty,
      }));
      const { error: lErr } = await supabase.from("refill_lines").insert(lineRows);
      if (lErr) throw new Error(`refill_lines: ${lErr.message}`);

      // Ledger: out of warehouse, into machine
      for (const i of items) {
        await recordStockMovement({
          productId: i.productId,
          location: "warehouse",
          qty: -i.qty,
          reason: "refill",
          referenceId: refill.id as string,
          notes: `Distributed from PO ${poId.slice(0, 8)}`,
          createdBy: operator,
        });
        await recordStockMovement({
          productId: i.productId,
          location: machineId,
          machineId,
          qty: i.qty,
          reason: "refill",
          referenceId: refill.id as string,
          notes: `From PO ${poId.slice(0, 8)}`,
          createdBy: operator,
        });
        unitsMoved += i.qty;
      }
      refillsCreated++;
    }

    return NextResponse.json({
      success: true,
      refillsCreated,
      unitsMoved,
      message: `Created ${refillsCreated} refill event${refillsCreated === 1 ? "" : "s"}, moved ${unitsMoved} units.`,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
