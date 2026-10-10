# Provider cost review — 2026-10-10

This is a public-list-price comparison for planning, not a quote or evidence of the user's current provider account, region, taxes, egress, overages, discounts, or configured plan. Confirm the selected region, plan, and billing estimator in each console before purchase. No production provider is implicitly approved by this document.

## Indicative monthly options (USD, before tax)

| Component | Entry / evaluation option | Small commercial production planning figure | Notes |
|---|---:|---:|---|
| Next.js hosting — Vercel | Hobby $0/month | Pro $20/month | Hobby is for personal/non-commercial use; Pro includes $20 usage credit according to published pricing. Additional usage/seat costs may apply. |
| Managed MySQL — Aiven | Free $0/month (1 GB, no region selection); Developer $5/month (8 GB, no region selection) | Hobbyist from $19/month; Startup from $75/month; Business from $180/month | Listed minimums vary by cloud/region and capacity. Aiven lists Startup with a 99.99% uptime SLA and Business with high availability; confirm plan-specific backup retention and location. |
| Private object storage — Cloudflare R2 Standard | Free allowance may cover small test data | $0.015 per GB-month after included usage; Class A $4.50/million, Class B $0.36/million | No internet egress fee in published Standard pricing. Use a private bucket and signed access for invoice PDFs. Confirm free usage allowance and operation mix before estimating the bill. |
| Transactional email — Resend | Free $0/month, up to 3,000 emails/month and 100/day | Pro $20/month for 50,000 emails/month; extra messages $0.90/1,000 | Paid plan needed if higher-volume use or feature requirements exceed the free tier. |
| Transactional email — Amazon SES alternative | Essentials list price $0.16/1,000 email sends | Approx. $16 for 100,000 emails at the first listed tier | Usage-priced; domain verification, production sending access, configuration and ancillary services still require setup. |

## Simple planning totals (not commitments)

- **Prototype (non-production only):** Vercel Hobby $0 + Aiven Free/Developer $0–$5 + Resend Free $0 + R2 usage possibly within free allowance = roughly $0–$5/month before taxes, overages, or storage/operation fees. Free-tier eligibility/retention/regions limit suitability.
- **Commercial app baseline with Vercel Pro, Aiven Hobbyist, Resend Free:** at least roughly $39/month (20 + 19) before usage, tax, storage and operational extras. The selected Aiven plan may not provide the high-availability posture wanted for financial workloads.
- **More resilient database option:** Vercel Pro $20 + Aiven Business starting at $180 + Resend Free = at least roughly $200/month before storage, overages, taxes, backups/export storage and optional service charges. Price will vary by cloud, region, capacity and current plan availability.
- If choosing Resend Pro instead of its free tier, add $20/month. If choosing SES, estimate email by count and any associated services rather than a monthly subscription.

These totals intentionally exclude domains, currency conversion, GST/VAT, log/analytics products, support plans, backup export storage, taxes, and variable bandwidth/compute. Set a monthly spend alert and budget before exposing a public production service.

## Recommendation and decision status

1. Use GitHub Actions for CI; current workflows use public-repository GitHub-hosted runners, which GitHub documents as having no billable minutes.
2. Use Vercel Pro only if the app's commercial/operational needs require it; do not assume Hobby is allowed for a commercial invoice-management system.
3. Keep Aiven as the proposed managed database only after verifying actual TLS connectivity, acceptable Mumbai/India-region latency and data location, backup retention, access restrictions, and real account pricing. Do not choose a production tier based on sticker price alone.
4. Use private R2-compatible storage for invoice documents only after testing signed downloads, retention, and encryption/access controls.
5. Compare Resend and Amazon SES with the expected invoice/reminder volume and domain verification needs before finalizing email. No email provider integration is committed by this cost review.
6. Revisit this cost review before launch and whenever usage, retention, region, or compliance needs change.

## Official sources checked 2026-10-10

- Aiven MySQL pricing: https://aiven.io/pricing/mysql
- Aiven MySQL backups: https://aiven.io/docs/products/mysql/concepts/mysql-backups
- Aiven backup access/configuration: https://aiven.io/docs/platform/concepts/service_backups
- Vercel plan pricing: https://vercel.com/pricing
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Resend pricing: https://resend.com/pricing
- Amazon SES pricing: https://aws.amazon.com/ses/pricing/
- GitHub Actions public-runner billing: https://docs.github.com/en/actions/how-tos/monitor-workflows/view-job-execution-time
