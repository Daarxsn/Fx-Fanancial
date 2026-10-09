export default function HomePage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">FX</div>
        <div>
          <p className="eyebrow">FALCHION XENIAA</p>
          <h1>Invoice workspace</h1>
        </div>
        <span className="environment">Foundation</span>
      </header>

      <section className="hero">
        <p className="eyebrow">FINANCE OPERATIONS</p>
        <h2>One reliable place for every invoice.</h2>
        <p className="hero-copy">
          The foundation is being prepared for secure invoice creation, issue tracking,
          payment recording and audit-ready document history.
        </p>
        <div className="status-line"><span className="status-dot" /> Application foundation</div>
      </section>

      <section className="grid" aria-label="Planned workspace modules">
        <article className="module">
          <span className="module-index">01</span>
          <h3>Invoices</h3>
          <p>Draft, validate, issue and preserve invoice snapshots.</p>
          <span className="module-status">Planned</span>
        </article>
        <article className="module">
          <span className="module-index">02</span>
          <h3>Customers</h3>
          <p>Maintain customer records and document-specific details.</p>
          <span className="module-status">Planned</span>
        </article>
        <article className="module">
          <span className="module-index">03</span>
          <h3>Payments</h3>
          <p>Track partial and full payments independently of invoice status.</p>
          <span className="module-status">Planned</span>
        </article>
      </section>
      <footer>Internal business application · Access controls and production workflows are not enabled yet.</footer>
    </main>
  );
}
