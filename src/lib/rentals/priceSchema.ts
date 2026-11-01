import { z } from 'zod';

/** A price plan as Vachi staff enter it on /platform. */
export const priceSchema = z.object({
  name: z.string().trim().min(1, 'Give the plan a name.').max(80),
  kind: z.enum(['landlord', 'homeowner']),
  homeLimit: z.union([z.literal(''), z.coerce.number().int('Use a whole number.').min(1).max(10000)]).optional(),
  months: z.coerce.number().int('Use a whole number.').min(1, 'At least 1 month.').max(60),
  price: z.coerce.number().min(1, 'At least $1.').max(100000),
  description: z.string().trim().max(300).optional(),
  isActive: z.boolean().optional(),
});

export function priceValues(d: z.infer<typeof priceSchema>) {
  return {
    name: d.name,
    kind: d.kind,
    homeLimit: d.homeLimit === '' || d.homeLimit === undefined ? null : d.homeLimit,
    months: d.months,
    price: d.price.toFixed(2),
    description: d.description || null,
    isActive: d.isActive ?? true,
  };
}
