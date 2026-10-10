# Phase 04 — Design System and Application Shell

**Status:** UI foundation completion gate passed. CI, UI foundation checks, lint, TypeScript and production build passed on commit `e5dbbba496d34d92632bcb0b4f3df754df1844e5`. Business workflows remain explicitly separate and are not represented as live while their protected endpoints are planned.

## 1. Visual language

The workspace uses a restrained finance-operations visual system: warm-neutral canvas, white/surface cards, dark navy shell accents, brand red for primary actions, readable muted secondary text, thin dividers and small, deliberate status indicators.

### Implemented tokens

Defined centrally in `src/app/globals.css`:

- **Brand:** red primary action and accent (`--red`, `--red-hover`, `--red-tint`), deep navy (`--navy`, `--navy-soft`).
- **Surfaces:** canvas, surface, subtle surface, raised surface and hover surface; all have light/dark equivalents.
- **Text:** strong, default, muted and muted-strong text tokens.
- **State colors:** semantic success, warning, danger and info pairs, always shown with text/icons as well as color.
- **Controls:** line/strong line, focus color, consistent small/medium/large radii and subtle/card shadows.
- **Typography:** Geist Sans/Mono via Next font variables; a compact heading/body/metadata scale with tabular/financial content kept readable.
- **Layout rhythm:** 4px spacing base and consistent component spacing; desktop content uses a maximum width while mobile pages preserve horizontal breathing room.
- **Theme:** light by default; user can toggle dark/light mode from the shared header. The choice is saved in local storage as `fx-theme`. A storage restriction does not prevent switching theme for the current session.

### Component rules

- Use theme tokens for surfaces and text together; do not pair a darkened background with an inherited dark text color.
- Use brand red selectively for primary action/active navigation, not as a large background on every component.
- Status badges pair semantic text with icon and an appropriately tinted background/border.
- Controls include minimum usable hit areas, visible hover/focus/disabled states, readable labels and clear button hierarchy.
- Respect `prefers-reduced-motion`; do not rely on transitions/animation to convey meaning.
- Avoid using ASCII emoji or unlabelled icon glyphs as primary UI controls. SVG icons come from the common typed icon set in `src/components/icon.tsx`.

## 2. Application shell

Implemented in `src/components/app-shell.tsx` and mounted from the root layout:

- Brand/workspace identity with an explicit foundation-environment label.
- Primary navigation groups: Overview; Invoices, Quotations, Customers and Items & services; Payments, Reports and Audit trail; Settings.
- Active section and current page use a selected visual state and `aria-current="page"`.
- Shared top bar shows navigation context, environment status and a working theme toggle.
- Breadcrumbs and consistent page header patterns live in reusable UI primitives.
- Mobile drawer has open/close controls, Escape handling, focus movement/trapping, focus restoration, background scroll lock and a scrim that closes navigation.
- Keyboard users receive a skip link to the main-content landmark; focus indicators use a high-visibility focus token.
- Root loading, safe route error and not-found experiences are provided.

The header intentionally does not claim that a login identity, global search, notification center or workspace switcher is implemented. These should be activated when their underlying authenticated capabilities and behaviors exist.

## 3. Page structure

### Overview

`src/app/page.tsx` provides an editorial workspace introduction, links to the foundational modules, empty recent-activity state and foundation-readiness list. It contains no fabricated invoice counts, revenue numbers, payment totals or fake activity feed.

### Module landing pages

`src/app/[section]/page.tsx` supplies consistent section layouts for invoices, quotations, customers, items/services, payments, reports, audit and settings. Each page describes its scope and shows honest planned/API-foundation status. Unimplemented data tables and commands are not misrepresented as working finance workflows.

Current route implementation is intentionally scoped:

- Health endpoints: available separately.
- Customer list/create API: available; full data table/detail/edit/archive UI is not yet connected.
- Catalog item list/create API: available; full data table/detail/edit/archive UI is not yet connected.
- Invoice, payment, quotation, report, audit, settings and other advanced operations: foundation pages only until matching protected APIs and tests are implemented.

## 4. Reusable UI inventory

Implemented in `src/components/ui.tsx`:

| Component | Behavior |
|---|---|
| `Button`, `IconButton` | Shared variants/sizes, disabled state, icon labels and pressed/expanded state support |
| `TextField`, `SelectField`, `TextAreaField` | Labelled controls, hint/error descriptions, required state and `aria-invalid` support |
| `FieldError` | Field-level validation message wired by described-by ID |
| `Card` | Standardized bordered surface and page section primitive |
| `StatusBadge` | Neutral/success/warning/danger/info semantic status treatment |
| `PageHeader`, `Breadcrumbs` | Consistent page title, description, route hierarchy and optional actions |
| `LoadingState` | Spinner with a screen-reader status label |
| `EmptyState` | Clear title/explanation, optional icon and optional action slot |
| `ErrorState` | Safe, recoverable error panel and optional retry action |
| `InlineAlert` | Informational, success, warning or error feedback with semantic role |
| `DataTable` | Semantic table/caption, responsive horizontal scroller and loading/empty/error states |
| `PaginationControls` | Bounded previous/next controls with accessible navigation label and range metadata |
| `ConfirmDialog` | Accessible modal semantics, Escape-to-close, keyboard focus trap, initial focus, close/cancel behavior and busy state |
| `ToastRegion` | Live-region feedback, dismissal control and automatic timeout |

The root `loading.tsx`, `error.tsx` and `not-found.tsx` provide route-level loading, error recovery and not-found patterns. These UI components are the foundation; a business mutation must only show success after its API has confirmed the operation.

## 5. Responsive and accessibility standards

Implemented styles and markup cover:

- Desktop, intermediate/tablet and mobile CSS breakpoints (1120px, 900px, 650px and 380px).
- One-column mobile module cards and content grids; mobile sidebar becomes a drawer rather than shrinking the content.
- A visible skip link, semantic main/nav/footer landmarks and accessible navigation label.
- `aria-current`, descriptive icon-button labels, status/loading live regions and dialog title/description relationships.
- Visible `:focus-visible` styling for links, buttons, fields and keyboard-focusable page regions.
- Dialog focus containment; Escape closes the dialog when not busy, and focus returns to the prior element.
- Mobile drawer focus handling, Escape-to-close and background scroll lock.
- Reduced-motion preference, safe text wrapping, small-screen control sizing and theme-safe semantic colors.

### Validation in CI

`npm run ui:validate` checks required design tokens, dark/light mode support, root shell mounting, primary navigation semantics, mobile keyboard behavior, focus styling, responsive breakpoints, reduced-motion styling, shared feedback components and the root loading/error/not-found experiences. The normal CI workflow also runs OpenAPI validation, API/database integration checks, lint, TypeScript and production build.

The static UI validation is a guardrail for code-level invariants; it does not replace manual visual review across actual browsers/devices or end-to-end testing of implemented business flows. A manual browser/device review has not been performed in this pass; the code-level breakpoint and accessibility checks are automated.

## 6. Completion gate

- [x] Visual language, typography, palette, spacing, icon set and shared component conventions implemented.
- [x] Responsive application shell, navigation, top bar, breadcrumbs and page layouts implemented.
- [x] Loading, empty, error, success/notice, toast and confirmation patterns implemented.
- [x] Accessible form fields, field-level validation messages, responsive data-table primitive and pagination controls implemented.
- [x] Light/dark theme works from the shared top bar and saves preference locally.
- [x] Desktop/tablet/mobile breakpoints are implemented; narrow-screen navigation uses an accessible drawer.
- [x] Keyboard skip link, visible focus, nav current state, modal focus trap/return and reduced-motion support implemented.
- [x] Module pages avoid fake financial metrics and do not present planned endpoints as active.
- [x] Code-level UI foundation validation added to CI.
- [x] Latest CI passes, including the responsive/accessibility UI foundation validator, lint, TypeScript and production build.

Evidence:
- CI success: https://github.com/Daarxsn/Fx-Fanancial/actions/runs/38050370293
- Lockfile/build workflow success: https://github.com/Daarxsn/Fx-Fanancial/actions/runs/38050370244
- UI foundation validator: `scripts/validate-ui-foundation.mjs`

**Follow-up QA note:** a manual browser/device screenshot review has not been performed in this pass. The responsive breakpoints and keyboard-related invariants are implemented and code-level validated; do a visual smoke review at desktop, tablet and narrow mobile widths before a production release.

### Separate business-flow prerequisites

- [ ] Connect customer/catalog list and edit/archive experiences to fully tested, protected APIs.
- [ ] Implement and test invoice/quotation/payment/approval/document/email/report workflows before showing their actions as available.
- [ ] Connect user identity/menu, notifications, global search and permissions once authentication and those capabilities are approved and implemented.

**Completion gate for Phase 04: PASSED.** The consistent, responsive UI foundation and automated code-level accessibility checks are implemented and CI-validated. Business workflows and production visual QA remain separate gates.
