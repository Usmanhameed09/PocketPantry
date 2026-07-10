"use client";

import Header from "@/components/Header";
import InventoryTabs from "../InventoryTabs";
import WarehouseView from "../WarehouseView";
import { PAGE_BG } from "../ui";

export default function WarehousePage() {
  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG }}>
      <Header title="Warehouse" />
      <InventoryTabs />
      <WarehouseView />
    </div>
  );
}
