export const TEMPLATE_SYSTEM_LEAD_ID = "SYS-TEMPLATES";
export const MACHINE_SYSTEM_LEAD_PREFIX = "SYS-MACHINE-";
export const GOOGLE_CALENDAR_SYSTEM_LEAD_ID = "SYS-GOOGLE-CALENDAR";
export const PRICING_SYSTEM_LEAD_ID = "SYS-PRICING-ANALYSES";

export function isSystemLeadId(id: string | undefined | null) {
  if (!id) return false;
  return (
    id === TEMPLATE_SYSTEM_LEAD_ID ||
    id === GOOGLE_CALENDAR_SYSTEM_LEAD_ID ||
    id === PRICING_SYSTEM_LEAD_ID ||
    id.startsWith(MACHINE_SYSTEM_LEAD_PREFIX)
  );
}

export function getMachineSystemLeadId(machineId: string) {
  const sanitized = machineId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${MACHINE_SYSTEM_LEAD_PREFIX}${sanitized}`;
}
