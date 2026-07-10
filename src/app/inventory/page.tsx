"use client";

// Inventory "Overview" — per operator request, identical to the Warehouse
// page. Both render the shared <WarehouseView/> so they can never drift.
import Header from "@/components/Header";
import InventoryTabs from "./InventoryTabs";
import WarehouseView from "./WarehouseView";
import { PAGE_BG } from "./ui";

export default function InventoryOverviewPage() {
  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG }}>
      <Header title="Inventory" />
      <InventoryTabs />
      <WarehouseView />
    </div>
  );
}
