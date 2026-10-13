import "server-only";
import { z } from "zod";
import { currencySchema, uuidSchema } from "@/lib/validation/master-data";

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
export const calendarDateSchema = z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Enter a real calendar date in YYYY-MM-DD format.");

export const addressSchema = z.object({
  line1: z.string().trim().min(1).max(255),
  line2: optionalText(255),
  city: z.string().trim().min(1).max(120),
  state: optionalText(120),
  postalCode: z.string().trim().min(1).max(40),
  countryCode: z.string().trim().regex(/^[A-Z]{2}$/),
}).strict();

export const bankDetailsSchema = z.object({
  accountName: optionalText(160),
  bankName: optionalText(160),
  accountNumber: optionalText(80),
  ifsc: optionalText(40),
  swift: optionalText(40),
  instructions: optionalText(1000),
}).strict();

const taxSetupSchema = z.enum(["UNCONFIGURED", "APPROVED_NOT_APPLICABLE", "APPROVED_CONFIGURED"]);
export const legalEntityCreateSchema = z.object({
  legalName: z.string().trim().min(1).max(255),
  displayName: z.string().trim().min(1).max(255),
  registrationNumber: optionalText(100),
  taxIdentifier: optionalText(100),
  address: addressSchema,
  countryCode: z.string().trim().regex(/^[A-Z]{2}$/),
  invoiceEmail: z.string().trim().email().max(320).optional().or(z.literal("")),
  invoicePhone: optionalText(50),
  website: z.string().trim().url().max(255).optional().or(z.literal("")),
  currency: currencySchema,
  locale: z.string().trim().min(2).max(35).optional().or(z.literal("")),
  timeZone: z.string().trim().min(1).max(80).optional().or(z.literal("")),
  logoReference: optionalText(1000),
  bankDetails: bankDetailsSchema.optional(),
  invoiceTerms: z.string().max(5000).optional(),
  invoiceFooter: z.string().max(5000).optional(),
  defaultTaxCode: optionalText(80),
  taxSetupStatus: taxSetupSchema.optional().default("UNCONFIGURED"),
  taxSetupApprovalReference: optionalText(255),
  changeReason: z.string().trim().min(3).max(1000),
}).strict().superRefine((value, ctx) => {
  if (value.address.countryCode !== value.countryCode) {
    ctx.addIssue({ code: "custom", path: ["address", "countryCode"], message: "Registered address country must match the legal entity country." });
  }
  if (value.timeZone) {
    try { new Intl.DateTimeFormat("en-US", { timeZone: value.timeZone }); }
    catch { ctx.addIssue({ code: "custom", path: ["timeZone"], message: "Use a supported IANA time zone." }); }
  }
  if (value.taxSetupStatus !== "UNCONFIGURED" && !value.taxSetupApprovalReference) {
    ctx.addIssue({ code: "custom", path: ["taxSetupApprovalReference"], message: "An authorized approval reference is required to confirm tax setup." });
  }
});

export const legalEntityUpdateSchema = legalEntityCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
  changeReason: z.string().trim().min(3).max(1000),
}).strict().superRefine((value, ctx) => {
  if (value.taxSetupStatus && value.taxSetupStatus !== "UNCONFIGURED" && !value.taxSetupApprovalReference) {
    ctx.addIssue({ code: "custom", path: ["taxSetupApprovalReference"], message: "An authorized approval reference is required to confirm tax setup." });
  }
  if (value.address && (!value.countryCode || !value.currency)) {
    ctx.addIssue({ code: "custom", path: ["address"], message: "Updating the registered address must include countryCode and currency for an unambiguous configuration revision." });
  }
});

export const brandCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9][A-Z0-9_-]*$/, "Use uppercase letters, digits, underscore or hyphen."),
  description: optionalText(1000),
  logoReference: optionalText(1000),
  theme: z.record(z.string(), z.unknown()).optional(),
  defaultTemplateKey: optionalText(80),
  legalEntityIds: z.array(uuidSchema).min(1).max(50),
  changeReason: z.string().trim().min(3).max(1000),
}).strict();

export const brandUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: optionalText(1000),
  logoReference: optionalText(1000),
  theme: z.record(z.string(), z.unknown()).optional(),
  defaultTemplateKey: optionalText(80),
  legalEntityIds: z.array(uuidSchema).min(1).max(50).optional(),
  isActive: z.boolean().optional(),
  changeReason: z.string().trim().min(3).max(1000),
}).strict();

export const taxRuleCreateSchema = z.object({
  legalEntityId: uuidSchema,
  taxCode: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(1).max(160),
  jurisdiction: z.string().trim().min(1).max(120),
  ratePercent: z.string().regex(/^(0|[1-9]\d{0,2})(\.\d{1,6})?$/, "Enter a non-negative percentage with up to six decimal places."),
  calculationMode: z.enum(["EXCLUSIVE", "INCLUSIVE"]),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  approvalReference: z.string().trim().min(3).max(255),
  changeReason: z.string().trim().min(3).max(1000),
}).strict().superRefine((value, ctx) => {
  if (Number(value.ratePercent) > 100) ctx.addIssue({ code: "custom", path: ["ratePercent"], message: "Rate must not exceed 100 percentage points; confirm the intended tax treatment with finance/tax." });
  if (value.effectiveUntil && value.effectiveUntil < value.effectiveFrom) ctx.addIssue({ code: "custom", path: ["effectiveUntil"], message: "End date must not precede start date." });
});

export const numberingCreateSchema = z.object({
  legalEntityId: uuidSchema,
  documentType: z.enum(["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE", "QUOTATION"]),
  seriesCode: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/),
  prefix: z.string().max(40),
  suffix: z.string().max(40).optional().default(""),
  sequenceWidth: z.number().int().min(1).max(12),
  includeFinancialYear: z.boolean(),
  financialYearStartMonth: z.number().int().min(1).max(12),
  financialYearStartDay: z.number().int().min(1).max(31),
  timeZone: z.string().trim().min(1).max(80),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  approvalReference: z.string().trim().min(3).max(255),
  activate: z.boolean().optional().default(false),
  changeReason: z.string().trim().min(3).max(1000),
}).strict().superRefine((value, ctx) => {
  if (value.effectiveUntil && value.effectiveUntil < value.effectiveFrom) ctx.addIssue({ code: "custom", path: ["effectiveUntil"], message: "End date must not precede start date." });
  const maxDay = new Date(Date.UTC(2024, value.financialYearStartMonth, 0)).getUTCDate();
  if (value.financialYearStartDay > maxDay) ctx.addIssue({ code: "custom", path: ["financialYearStartDay"], message: "Financial-year start day is invalid for the selected month." });
  try { new Intl.DateTimeFormat("en-US", { timeZone: value.timeZone }); }
  catch { ctx.addIssue({ code: "custom", path: ["timeZone"], message: "Use a supported IANA time zone." }); }
});

export const documentTemplateConfigSchema = z.object({
  pageSize: z.enum(["A4", "A5", "LETTER"]),
  orientation: z.enum(["PORTRAIT", "LANDSCAPE"]),
  layout: z.enum(["COMPACT", "STANDARD", "DETAILED"]),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  showLogo: z.boolean(),
  showTaxBreakdown: z.boolean(),
  showBankDetails: z.boolean(),
  showPaymentTerms: z.boolean(),
  showCustomerTaxIdentifier: z.boolean(),
  showFooter: z.boolean(),
  footerText: z.string().max(2000).optional(),
}).strict();

export const templateCreateSchema = z.object({
  legalEntityId: uuidSchema,
  brandId: uuidSchema.optional().or(z.literal("")),
  documentType: z.enum(["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE", "QUOTATION"]),
  templateKey: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9_-]+$/),
  displayName: z.string().trim().min(1).max(160),
  templateConfig: documentTemplateConfigSchema,
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  activate: z.boolean().optional().default(false),
  changeReason: z.string().trim().min(3).max(1000),
}).strict().superRefine((value, ctx) => {
  if (JSON.stringify(value.templateConfig).length > 60000) ctx.addIssue({ code: "custom", path: ["templateConfig"], message: "Template configuration must be under 60 KB." });
  if (value.effectiveUntil && value.effectiveUntil < value.effectiveFrom) ctx.addIssue({ code: "custom", path: ["effectiveUntil"], message: "End date must not precede start date." });
});


export const taxRegistrationCreateSchema = z.object({
  registrationKey: z.string().trim().min(2).max(100).regex(/^[A-Z0-9_-]+$/, "Use uppercase letters, digits, underscore or hyphen."),
  registrationType: z.enum(["GSTIN", "VAT", "TAX_ID", "COMPANY_REGISTRATION", "OTHER"]),
  jurisdiction: z.string().trim().min(1).max(120),
  registrationNumber: z.string().trim().min(1).max(160),
  displayLabel: z.string().trim().min(1).max(160),
  isPrimary: z.boolean().optional().default(false),
  effectiveFrom: calendarDateSchema,
  effectiveUntil: calendarDateSchema.optional().or(z.literal("")),
  approvalReference: z.string().trim().min(3).max(255),
  changeReason: z.string().trim().min(3).max(1000),
}).strict().superRefine((value, ctx) => {
  if (value.effectiveUntil && value.effectiveUntil < value.effectiveFrom) ctx.addIssue({ code: "custom", path: ["effectiveUntil"], message: "End date must not precede start date." });
});

export const taxRegistrationDeactivationSchema = z.object({
  isActive: z.boolean(),
  changeReason: z.string().trim().min(3).max(1000),
}).strict();

export const businessUnitCreateSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9][A-Z0-9_-]*$/, "Use uppercase letters, digits, underscore or hyphen."),
  name: z.string().trim().min(1).max(160),
  description: optionalText(1000),
  legalEntityIds: z.array(uuidSchema).min(1).max(50),
  brandIds: z.array(uuidSchema).max(50).optional().default([]),
  changeReason: z.string().trim().min(3).max(1000),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.legalEntityIds).size !== value.legalEntityIds.length) ctx.addIssue({ code:"custom",path:["legalEntityIds"],message:"Duplicate legal entity mappings are not allowed." });
  if (new Set(value.brandIds).size !== value.brandIds.length) ctx.addIssue({ code:"custom",path:["brandIds"],message:"Duplicate brand mappings are not allowed." });
});

export const businessUnitUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: optionalText(1000),
  legalEntityIds: z.array(uuidSchema).min(1).max(50).optional(),
  brandIds: z.array(uuidSchema).max(50).optional(),
  isActive: z.boolean().optional(),
  changeReason: z.string().trim().min(3).max(1000),
}).strict().superRefine((value, ctx) => {
  if (value.legalEntityIds && new Set(value.legalEntityIds).size !== value.legalEntityIds.length) ctx.addIssue({ code:"custom",path:["legalEntityIds"],message:"Duplicate legal entity mappings are not allowed." });
  if (value.brandIds && new Set(value.brandIds).size !== value.brandIds.length) ctx.addIssue({ code:"custom",path:["brandIds"],message:"Duplicate brand mappings are not allowed." });
});
