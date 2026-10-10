import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sources = {
  css: await readFile("src/app/globals.css", "utf8"),
  layout: await readFile("src/app/layout.tsx", "utf8"),
  shell: await readFile("src/components/app-shell.tsx", "utf8"),
  primitives: await readFile("src/components/ui.tsx", "utf8"),
  overview: await readFile("src/app/page.tsx", "utf8"),
  sectionPage: await readFile("src/app/[section]/page.tsx", "utf8"),
  loading: await readFile("src/app/loading.tsx", "utf8"),
  error: await readFile("src/app/error.tsx", "utf8"),
  notFound: await readFile("src/app/not-found.tsx", "utf8"),
};

const checks = [
  ["shared AppShell mounted at the app root", sources.layout.includes("<AppShell>{children}</AppShell>")],
  ["semantic skip link and main landmark", sources.shell.includes("Skip to main content") && sources.shell.includes('id="main-content"') && sources.shell.includes("<main")],
  ["primary navigation is labeled and active links expose aria-current", sources.shell.includes('aria-label="Primary navigation"') && sources.shell.includes("aria-current={active ? \"page\" : undefined}")],
  ["mobile menu exposes expanded state and has Escape/focus handling", sources.shell.includes("expanded={mobileOpen}") && sources.shell.includes('event.key === "Escape"') && sources.shell.includes("mobileWasOpen.current") && sources.shell.includes("document.body.style.overflow")],
  ["theme switch persists preference and sets document theme", sources.shell.includes('localStorage.setItem("fx-theme", next)') && sources.shell.includes("document.documentElement.dataset.theme = next")],
  ["light and dark tokens are defined centrally", sources.css.includes(":root {") && sources.css.includes(':root[data-theme="dark"]') && sources.css.includes("--canvas:") && sources.css.includes("--surface:") && sources.css.includes("--ink:")],
  ["keyboard focus indicator is globally visible", sources.css.includes(":focus-visible") && sources.css.includes("--focus:")],
  ["mobile/tablet breakpoints are defined", sources.css.includes("@media (max-width: 1120px)") && sources.css.includes("@media (max-width: 900px)") && sources.css.includes("@media (max-width: 650px)")],
  ["reduced-motion preferences are respected", sources.css.includes("@media (prefers-reduced-motion: reduce)")],
  ["loading, empty, error and success/notice primitives exist", sources.primitives.includes("function LoadingState") && sources.primitives.includes("function EmptyState") && sources.primitives.includes("function ErrorState") && sources.primitives.includes("function InlineAlert")],
  ["live notification region and confirmation dialog are accessible", sources.primitives.includes("aria-live=") && sources.primitives.includes('role="dialog"') && sources.primitives.includes('aria-modal="true"') && sources.primitives.includes('event.key !== "Tab"')],
  ["route-level loading, error and not-found experiences exist", sources.loading.includes("LoadingState") && sources.error.includes('role="alert"') && sources.notFound.includes("This page isn’t here.")],
  ["unimplemented financial work is not shown as live data", sources.overview.includes("No activity is being shown") && sources.sectionPage.includes("not implemented yet")],
];

for (const [name, pass] of checks) {
  if (!pass) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${name}`);
  }
}

if (process.exitCode) {
  console.error("UI foundation checks failed.");
} else {
  console.log(`PASS: ${checks.length} responsive/accessibility/UI foundation checks.`);
}
