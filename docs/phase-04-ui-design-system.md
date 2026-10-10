# Phase 04 — UI Design System

**Status:** Design-system specification committed. The current home page is a foundation screen, not the finished invoice-management interface.

## Design goals

- Premium, restrained finance workspace with clear hierarchy and fast scanning.
- Desktop-first data density that remains usable on tablet and mobile.
- Accessible contrast, keyboard navigation, visible focus and meaningful labels.
- Consistent spacing, typography, border, surface, status and interaction patterns.
- Avoid presenting planned functionality as active. Disabled or unavailable operations must be explicit.

## Visual tokens

- Brand red: use sparingly for primary actions and important states.
- Deep navy: navigation and high-emphasis surfaces.
- Neutral canvas and white cards for the primary work area.
- Semantic status colors must be paired with text/icons, never color alone.
- Use a consistent 4px spacing base and a limited type scale.
- Keep radii, shadows, focus rings and control heights consistent.

## Core application shell

- Left navigation: Overview, Invoices, Quotations, Customers, Items & Services, Payments, Reports, Audit, Settings.
- Top bar: current section, global search when supported, help, and authenticated user menu once authentication exists.
- Content header: page title, concise explanation and permission-aware primary action.
- Breadcrumbs for nested resources.
- Responsive behavior: collapse navigation on narrow screens; preserve essential action access.

## Core screens

1. **Overview:** meaningful counts and recent activity only when backed by real data; no fabricated metrics.
2. **Invoice list:** searchable/filterable table, lifecycle status, customer, invoice date, due date, total, paid and outstanding values as distinct columns.
3. **Invoice editor:** customer and legal-entity selection, line editor, tax/discount configuration, totals summary, notes and live preview. Client calculations are previews only; server validates authoritative totals.
4. **Invoice details:** lifecycle, payment state, activity/audit history and document artifacts clearly separated.
5. **Customer list/detail:** search, validation and safe customer master editing.
6. **Payment entry:** amount, date, method, reference and explicit allocation to eligible invoices.
7. **Settings:** legal entities, brands, numbering/tax policy and roles, available only to authorized users.

## Interaction rules

- Destructive/irreversible operations require clear confirmation and a reason where applicable.
- Issued invoices show read-only financial fields; corrections use approved workflows.
- Loading, empty, validation, success, conflict and dependency-failure states are designed explicitly.
- Do not show a success state before the server confirms the operation.
- Preserve form input when safe after a recoverable validation error.
- Keyboard focus must remain visible after dialog actions and navigation.
- Tables need useful empty states, sortable allowlisted columns and bounded pagination.
- Avoid color-only labels and tiny low-contrast metadata.

## Reusable component inventory

- AppShell, SideNavigation, TopBar, PageHeader, Breadcrumbs.
- Button, IconButton, TextField, Select, DateField, CurrencyField, TextArea.
- StatusBadge, DataTable, Pagination, SearchFilterBar.
- ConfirmDialog, FormFieldError, Toast/Alert, LoadingState, EmptyState, ErrorState.
- InvoiceTotals, InvoiceLineEditor, InvoicePreview, PaymentSummary, AuditTimeline.

## Acceptance criteria

- [x] Design principles and core screen inventory documented.
- [ ] Token definitions are implemented in the application.
- [ ] Components are accessible and responsive.
- [ ] Invoice/customer/payment workflows use real API data.
- [ ] Loading, empty, error, validation and permission states are tested.
- [ ] Visual review completed at mobile, tablet and desktop widths.

No UI screen may bypass server-side authorization or treat browser-calculated financial totals as authoritative.
