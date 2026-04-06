import { createServerClient } from "@/lib/supabase";
import { getMachineSystemLeadId } from "@/lib/system-records";

export type StoredMachineOrder = {
  orderNo: string;
  amount: number;
  status: string;
  statusCode: number;
  payTime: string | null;
  createdAt: string | null;
  deviceName: string;
  stickerNum: string;
  items: string;
  totalItems: number;
  isRefund: number;
  refundPrice: string;
};

export type MachineOrderSnapshot = {
  machineId: string;
  machineName: string;
  platform: string;
  total: number;
  orders: StoredMachineOrder[];
  syncedAt: string;
};

const MACHINE_ORDER_ACTION_TYPE = "call";
const MACHINE_ORDER_KIND = "machine_orders_snapshot";

async function ensureMachineSystemLead(machineId: string, machineName?: string) {
  const supabase = createServerClient();
  const systemLeadId = getMachineSystemLeadId(machineId);
  const { data: existing, error: lookupError } = await supabase
    .from("leads")
    .select("id")
    .eq("id", systemLeadId)
    .maybeSingle();

  if (lookupError && lookupError.code !== "PGRST116") {
    throw lookupError;
  }

  if (existing?.id) {
    return systemLeadId;
  }

  const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const { error: insertError } = await supabase.from("leads").insert({
    id: systemLeadId,
    business: `__SYSTEM__ Machine ${machineId}`,
    contact: "System",
    phone: "0000000000",
    email: "",
    address: "",
    distance: "—",
    business_type: "machine_system",
    source: "Manual",
    stage: "New Lead",
    contact_method: "Call",
    call_attempts: 0,
    added_date: dateStr,
    last_activity: `Machine cache for ${machineName || machineId}`,
  });

  if (insertError && insertError.code !== "23505") {
    throw insertError;
  }

  return systemLeadId;
}

export async function saveMachineOrderSnapshot(snapshot: MachineOrderSnapshot) {
  const supabase = createServerClient();
  const systemLeadId = await ensureMachineSystemLead(snapshot.machineId, snapshot.machineName);
  const { error } = await supabase.from("outreach_log").insert({
    lead_id: systemLeadId,
    action_type: MACHINE_ORDER_ACTION_TYPE,
    action_data: {
      kind: MACHINE_ORDER_KIND,
      ...snapshot,
    },
  });

  if (error) {
    throw error;
  }
}

export async function getStoredMachineOrderSnapshot(machineId: string): Promise<MachineOrderSnapshot | null> {
  const supabase = createServerClient();
  const systemLeadId = getMachineSystemLeadId(machineId);
  const { data, error } = await supabase
    .from("outreach_log")
    .select("action_data, performed_at")
    .eq("lead_id", systemLeadId)
    .eq("action_type", MACHINE_ORDER_ACTION_TYPE)
    .order("performed_at", { ascending: false })
    .limit(10);

  if (error) {
    throw error;
  }

  const match = (data || []).find((row) => {
    const actionData = row.action_data as { kind?: string } | null;
    return actionData?.kind === MACHINE_ORDER_KIND;
  });

  if (!match) {
    return null;
  }

  const actionData = match.action_data as MachineOrderSnapshot & { kind?: string };
  return {
    machineId: actionData.machineId,
    machineName: actionData.machineName,
    platform: actionData.platform,
    total: actionData.total,
    orders: actionData.orders || [],
    syncedAt: actionData.syncedAt || match.performed_at,
  };
}
