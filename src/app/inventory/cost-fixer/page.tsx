import { redirect } from "next/navigation";

// Cost Fixer moved into the Pricing module (it corrects unit COSTS, which is
// pricing work). This route is kept only to redirect old links/bookmarks.
export default function CostFixerMovedPage() {
  redirect("/pricing?tab=cost-fixer");
}
