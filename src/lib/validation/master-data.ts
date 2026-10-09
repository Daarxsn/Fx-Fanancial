import "server-only";

import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const currencySchema = z.string().regex(/^[A-Z]{3}$/, "Currency must be a three-letter uppercase code");
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD");

export const customerCreateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  billingAddress: z.record(z.string(), z.unknown()).optional(),
  taxIdentifier: z.string().trim().max(100).optional().or(z.literal("")),
  notes: z.string().max(5000).optional(),
}).strict();

export const catalogItemCreateSchema = z.object({
  itemCode: z.string().trim().min(1).max(80).optional().or(z.literal("")),
  itemType: z.enum(["PRODUCT", "SERVICE"]),
  name: z.string().trim().min(1).max(255),
  customerDescription: z.string().trim().min(1).max(1000),
  internalDescription: z.string().max(1000).optional(),
  unitCode: z.string().trim().min(1).max(40),
  defaultUnitPrice: z.string().regex(/^(0|[1-9]\d{0,14})(\.\d{1,4})?$/, "Price must be a non-negative decimal with up to four fractional digits"),
  currency: currencySchema,
  defaultTaxCode: z.string().trim().max(80).optional(),
}).strict();

export const customerUpdateSchema = customerCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required",
);

export const catalogItemUpdateSchema = catalogItemCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required",
);
