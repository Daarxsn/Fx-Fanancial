# Brand assets and reference artwork

## Exact supplied logo exports embedded by the application

- `falchion-xeniaa-logo.webp` — exact 300×150 transparent WebP export from the uploaded Falchion Xeniaa logo pack; used on the application shell, login, invitation activation and illustrative template preview.
- `myfx-pos.webp` — exact 360×142 transparent WebP export from the supplied MyFX POS logo pack; used in Settings as the line-of-business logo.
- `fx-digitech.webp` — exact 360×94 transparent WebP export from the supplied FX Digitech logo pack; used in Settings as the line-of-business logo.

## Reconstructed-only assets

- `fx-coworks.svg` — scalable visual reconstruction of the supplied Coworks mark. The exact Coworks raster export has not yet been integrated; compare and replace this reconstruction with the approved original before production brand sign-off.
- `falchion-xeniaa-logo.svg`, `myfx-pos.svg` and `fx-digitech.svg` — editable vector reconstructions retained as design references, not used in place of the exact supplied WebPs in the live header/gallery.
- `templates/myfx-pos-sample.svg`, `templates/digitech-sample.svg`, `templates/coworks-sample.svg` — invoice-layout reconstructions informed by the supplied invoice samples, not pixel copies of them and not active templates or issued documents.

The supplied design guide specifies Gold `#DCAF51`, Saffron Red `#931314`, Charcoal `#111111`, Platinum `#F4F4F5` and White `#FFFFFF`, with Sansation for display headings and Open Sans for UI/body text. The current CSS requests those font families from Google Fonts with system fallbacks; production owners must approve external font delivery or provide licensed self-hosted fonts.

Raw invoice samples are deliberately **not** stored in `public/`: they contain example business/customer and financial details. Never place production invoices, account numbers, tax identifiers, customer data or signed company configuration in this public directory.
