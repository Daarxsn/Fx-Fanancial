"use client";

import Link from "next/link";
import { Icon } from "@/components/icon";
import { Breadcrumbs, Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";

const modules = [
  { number: "01", title: "Invoices", description: "A clear path from draft to issue-ready records.", href: "/invoices", icon: "invoice" as const, status: "Foundation ready" },
  { number: "02", title: "Customers", description: "Organize the customer information future documents rely on.", href: "/customers", icon: "users" as const, status: "Master data" },
  { number: "03", title: "Items & services", description: "Prepare reusable descriptions, units and exact-decimal price defaults.", href: "/catalog", icon: "box" as const, status: "Master data" },
];

export default function HomePage() {
  return (
    <div className="page page--overview">
      <Breadcrumbs items={[{ label: "Workspace" }, { label: "Overview" }]} />
      <PageHeader
        eyebrow="FINANCE OPERATIONS"
        title="Your finance, in focus."
        description="A considered workspace for document creation, customer records and payment tracking—built around accurate data and accountable actions."
      />
      <section className="welcome-panel" aria-labelledby="welcome-title">
        <div className="welcome-panel__content">
          <StatusBadge tone="info" icon="sparkles">Workspace foundation</StatusBadge>
          <h2 id="welcome-title">A better way to keep business moving.</h2>
          <p>The shared interface is ready. Business workflows will become available as their secured APIs and company rules are completed.</p>
          <div className="welcome-panel__foot">
            <span className="welcome-panel__live"><span aria-hidden="true" /> UI foundation active</span>
            <span className="welcome-panel__separator" aria-hidden="true" />
            <span>Secure-by-design architecture</span>
          </div>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="welcome-art__halo" />
          <div className="welcome-art__paper welcome-art__paper--back" />
          <div className="welcome-art__paper">
            <span className="welcome-art__paper-mark">FX</span>
            <span className="welcome-art__line welcome-art__line--long" />
            <span className="welcome-art__line" />
            <span className="welcome-art__line welcome-art__line--mid" />
            <span className="welcome-art__rule" />
            <span className="welcome-art__line welcome-art__line--short" />
            <span className="welcome-art__stamp"><Icon name="check" size={17} /></span>
          </div>
          <span className="welcome-art__spark welcome-art__spark--one">✦</span>
          <span className="welcome-art__spark welcome-art__spark--two">✧</span>
        </div>
      </section>

      <div className="section-heading">
        <div><p className="eyebrow">YOUR WORKSPACE</p><h2>Start with the essentials</h2></div>
        <span className="section-heading__hint">Explore the foundation</span>
      </div>

      <section className="module-grid" aria-label="Workspace modules">
        {modules.map((module) => (
          <Link className="module-card" href={module.href} key={module.href}>
            <div className="module-card__top">
              <span className="module-card__icon"><Icon name={module.icon} size={21} /></span>
              <span className="module-card__number">{module.number}</span>
            </div>
            <h3>{module.title}</h3>
            <p>{module.description}</p>
            <div className="module-card__bottom">
              <span>{module.status}</span>
              <span className="module-card__arrow"><Icon name="arrow-up-right" size={17} /></span>
            </div>
          </Link>
        ))}
      </section>

      <div className="overview-lower-grid">
        <Card className="activity-card">
          <div className="card-heading">
            <div><h2>Recent activity</h2><p>Important workspace actions will appear here.</p></div>
            <span className="card-heading__icon"><Icon name="activity" size={19} /></span>
          </div>
          <EmptyState
            icon="clock"
            title="Nothing to report yet"
            description="No activity is being shown because business workflows have not been connected. This keeps the overview honest and ready for real data."
          />
        </Card>
        <Card className="readiness-card">
          <div className="card-heading">
            <div><h2>Foundation status</h2><p>The shared experience, at a glance.</p></div>
            <span className="card-heading__icon"><Icon name="shield" size={19} /></span>
          </div>
          <div className="readiness-list">
            <div><span className="readiness-list__icon readiness-list__icon--success"><Icon name="check" size={15} /></span><span><strong>Design system</strong><small>Tokens and shared components</small></span><StatusBadge tone="success">Ready</StatusBadge></div>
            <div><span className="readiness-list__icon readiness-list__icon--success"><Icon name="check" size={15} /></span><span><strong>Responsive shell</strong><small>Desktop, tablet and mobile</small></span><StatusBadge tone="success">Ready</StatusBadge></div>
            <div><span className="readiness-list__icon"><Icon name="clock" size={15} /></span><span><strong>Finance workflows</strong><small>Awaiting API implementation</small></span><StatusBadge tone="warning">In progress</StatusBadge></div>
          </div>
          <div className="readiness-note"><Icon name="lock" size={15} /><span>Unreleased workflows are not presented as active.</span></div>
        </Card>
      </div>
    </div>
  );
}
