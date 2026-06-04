"use client";

/**
 * Help-center UI. Two-pane layout: doc list on the left, rendered markdown
 * on the right. URL hash drives which doc is shown so links from elsewhere
 * (eg /help#04-inventory) can deep-link to a specific SOP.
 */

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import { useIsMobile } from "@/hooks/useIsMobile";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, ChevronRight, Search, Menu } from "lucide-react";

type Doc = { slug: string; title: string; content: string };

export default function HelpClient({ docs }: { docs: Doc[] }) {
  const isMobile = useIsMobile();
  const [activeSlug, setActiveSlug] = useState<string>(docs[0]?.slug || "");
  const [query, setQuery] = useState("");
  const [navOpen, setNavOpen] = useState(false);

  // Sync to URL hash so /help#05-pricing opens the pricing doc directly.
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace(/^#/, "");
      if (h && docs.find((d) => d.slug === h)) setActiveSlug(h);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [docs]);

  function go(slug: string) {
    setActiveSlug(slug);
    window.history.replaceState(null, "", `#${slug}`);
    if (isMobile) setNavOpen(false);
    // Scroll to top of content pane
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(
      (d) => d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q),
    );
  }, [docs, query]);

  const active = docs.find((d) => d.slug === activeSlug) || docs[0];

  if (docs.length === 0) {
    return (
      <main style={{ padding: 32, maxWidth: 800, margin: "0 auto" }}>
        <Header title="Help" />
        <p style={{ marginTop: 20, color: "#475569" }}>
          No help documents found. The SOP files should live at <code>docs/SOPs/</code>.
        </p>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh" }}>
      <Header title="Help & SOPs" />

      <div style={{ display: "flex", minHeight: "calc(100vh - 64px)" }}>
        {/* Left nav (collapsible on mobile) */}
        {(navOpen || !isMobile) && (
          <aside
            style={{
              width: isMobile ? "100%" : 280,
              minWidth: isMobile ? "100%" : 280,
              background: "#fff",
              borderRight: isMobile ? "none" : "1px solid #e2e8f0",
              borderBottom: isMobile ? "1px solid #e2e8f0" : "none",
              padding: "20px 14px",
              overflowY: "auto",
              maxHeight: isMobile ? "auto" : "calc(100vh - 64px)",
              position: isMobile ? "static" : "sticky",
              top: 64,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "0 6px",
                marginBottom: 12,
                color: "#0f172a",
              }}
            >
              <BookOpen size={16} />
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}>
                Standard Operating Procedures
              </span>
            </div>

            <div style={{ position: "relative", marginBottom: 12 }}>
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#94a3b8",
                }}
              />
              <input
                type="text"
                placeholder="Search docs…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px 8px 32px",
                  fontSize: 13,
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  outline: "none",
                  background: "#f8fafc",
                }}
              />
            </div>

            <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {filtered.map((d) => {
                const active = d.slug === activeSlug;
                return (
                  <button
                    key={d.slug}
                    onClick={() => go(d.slug)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: active ? "#16a34a" : "transparent",
                      color: active ? "#fff" : "#334155",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 13,
                      fontWeight: active ? 600 : 500,
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.background = "#f1f5f9";
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <ChevronRight
                      size={14}
                      style={{
                        opacity: active ? 1 : 0.5,
                        color: active ? "#fff" : "#94a3b8",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {d.title}
                    </span>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <div style={{ padding: 12, fontSize: 12, color: "#94a3b8" }}>
                  No docs match &quot;{query}&quot;
                </div>
              )}
            </nav>
          </aside>
        )}

        {/* Right content pane */}
        <article
          style={{
            flex: 1,
            padding: isMobile ? "16px 16px 60px" : "32px 48px 80px",
            maxWidth: 900,
            margin: "0 auto",
            width: "100%",
            background: "#f8fafc",
          }}
        >
          {isMobile && (
            <button
              onClick={() => setNavOpen((v) => !v)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                marginBottom: 14,
                background: "#fff",
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                color: "#0f172a",
                cursor: "pointer",
              }}
            >
              <Menu size={14} /> {navOpen ? "Hide" : "Show"} list
            </button>
          )}

          <div className="pp-md">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Rewrite cross-doc links: README.md links like
                // [text](04-inventory.md) become in-app navigation rather
                // than 404s. External links stay normal.
                a: ({ href, children }) => {
                  const h = String(href || "");
                  const m = h.match(/^(\d{2}-[a-z-]+)\.md$/);
                  if (m) {
                    return (
                      <a
                        href={`#${m[1]}`}
                        onClick={(e) => {
                          e.preventDefault();
                          go(m[1]);
                        }}
                      >
                        {children}
                      </a>
                    );
                  }
                  return (
                    <a href={h} target={h.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
                      {children}
                    </a>
                  );
                },
              }}
            >
              {active.content}
            </ReactMarkdown>
          </div>

          <style>{`
            .pp-md h1 { font-size: 28px; font-weight: 800; color: #0f172a; margin: 0 0 12px; letter-spacing: -0.4px; }
            .pp-md h2 { font-size: 20px; font-weight: 700; color: #0f172a; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }
            .pp-md h3 { font-size: 16px; font-weight: 700; color: #1e293b; margin: 22px 0 8px; }
            .pp-md h4 { font-size: 14px; font-weight: 700; color: #334155; margin: 18px 0 6px; }
            .pp-md p  { font-size: 14px; line-height: 1.65; color: #334155; margin: 0 0 14px; }
            .pp-md ul, .pp-md ol { font-size: 14px; line-height: 1.65; color: #334155; padding-left: 22px; margin: 0 0 14px; }
            .pp-md li { margin-bottom: 4px; }
            .pp-md li > ul, .pp-md li > ol { margin: 4px 0 0; }
            .pp-md strong { color: #0f172a; font-weight: 700; }
            .pp-md a { color: #0d9488; text-decoration: underline; text-underline-offset: 2px; }
            .pp-md a:hover { color: #0f766e; }
            .pp-md code {
              background: #f1f5f9; padding: 2px 6px; border-radius: 4px;
              font-family: ui-monospace, Menlo, Monaco, "Cascadia Mono", monospace;
              font-size: 12.5px; color: #be123c;
            }
            .pp-md pre {
              background: #0f172a; color: #f1f5f9; padding: 14px 16px; border-radius: 10px;
              overflow-x: auto; font-size: 12.5px; line-height: 1.5; margin: 0 0 14px;
            }
            .pp-md pre code { background: transparent; color: inherit; padding: 0; font-size: inherit; }
            .pp-md blockquote {
              border-left: 3px solid #16a34a; background: #f0fdf4;
              padding: 10px 14px; margin: 0 0 14px; color: #15803d; font-size: 13px;
              border-radius: 0 8px 8px 0;
            }
            .pp-md blockquote p { color: inherit; margin: 0; }
            .pp-md table {
              border-collapse: collapse; width: 100%; margin: 0 0 14px;
              font-size: 13px; background: #fff; border-radius: 8px; overflow: hidden;
              box-shadow: 0 0 0 1px #e2e8f0;
            }
            .pp-md th {
              text-align: left; padding: 10px 14px; background: #f8fafc;
              font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0;
            }
            .pp-md td { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: top; }
            .pp-md tr:last-child td { border-bottom: none; }
            .pp-md hr { border: none; border-top: 1px solid #e2e8f0; margin: 28px 0; }
          `}</style>
        </article>
      </div>
    </main>
  );
}
