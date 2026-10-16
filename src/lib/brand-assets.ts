export const APPROVED_BRAND_COLORS = [
  { name: "Gold", value: "#DAAF51" },
  { name: "Saffron Red", value: "#931314" },
  { name: "Charcoal", value: "#111111" },
  { name: "Platinum", value: "#F4F4F5" },
  { name: "White", value: "#FFFFFF" },
  { name: "Green", value: "#67AF7A" },
  { name: "Yellow", value: "#F5C25C" },
  { name: "Red", value: "#F25138" },
] as const;

export const BRAND_LOGO_ASSETS = [
  { code: "FALCHIONXENIAA", name: "Falchion Xeniaa", logoReference: "/brand/falchion-xeniaa-logo.svg", accentColor: "#DAAF51", audience: "Company" },
  { code: "MYFXPOS", name: "MyFX POS", logoReference: "/brand/myfx-pos-logo.svg", accentColor: "#DAAF51", audience: "Product" },
  { code: "DIGITECH", name: "FX Digitech", logoReference: "/brand/digitech-logo.svg", accentColor: "#F25138", audience: "Product" },
  { code: "COWORKS", name: "FX Coworks", logoReference: "/brand/coworks-logo.svg", accentColor: "#931314", audience: "Product" },
] as const;

export type BrandLogoAsset = (typeof BRAND_LOGO_ASSETS)[number];

export function resolveBrandLogo(reference?: string | null): BrandLogoAsset {
  return BRAND_LOGO_ASSETS.find((asset) => asset.logoReference === reference) ?? BRAND_LOGO_ASSETS[0];
}

export function isApprovedBrandColor(value: unknown): value is (typeof APPROVED_BRAND_COLORS)[number]["value"] {
  return typeof value === "string" && APPROVED_BRAND_COLORS.some((color) => color.value === value.toUpperCase());
}
