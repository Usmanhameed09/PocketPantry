/**
 * In-app help center — reads docs/SOPs/*.md from disk at request time
 * and hands them to the HelpClient for rendering.
 *
 * Server component (file-system access) → client component (interactivity).
 * No build-time generation: editing a .md file and refreshing the page
 * shows the new content immediately in dev. On Vercel the files ship
 * with the deployment, so prod is just as fast.
 */

import { promises as fs } from "fs";
import path from "path";
import HelpClient from "./HelpClient";

export const dynamic = "force-dynamic";

type Doc = { slug: string; title: string; content: string };

async function loadDocs(): Promise<Doc[]> {
  const dir = path.join(process.cwd(), "docs", "SOPs");
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const mds = files.filter((f) => f.endsWith(".md")).sort();
  const out: Doc[] = [];
  for (const f of mds) {
    try {
      const raw = await fs.readFile(path.join(dir, f), "utf8");
      // First H1 in the file is the title; fall back to filename
      const m = raw.match(/^#\s+(.+)$/m);
      const title = m ? m[1].trim() : f.replace(/\.md$/, "");
      const slug = f.replace(/\.md$/, "");
      out.push({ slug, title, content: raw });
    } catch {
      // skip unreadable file
    }
  }
  return out;
}

export default async function HelpPage() {
  const docs = await loadDocs();
  return <HelpClient docs={docs} />;
}
