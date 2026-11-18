import { z } from 'zod';

/** Mapping สิทธิ: the module code used by the registry, the gate and the manager role. */
export const PTTYPE_MAPPING_MODULE = 'pttype-mapping';

/** A HOSxP `pttype` or `paccount` code. Letters, digits and `._-` only, so it is safe in a URL and an audit row. */
export const hosxpCodeSchema = z.string().regex(/^[A-Za-z0-9._-]{1,20}$/);

const sideSchema = hosxpCodeSchema.nullable();

/** ผูกผังบัญชี of one สิทธิ: the new OPD/IPD codes (null = ยังไม่ผูก) and the codes the person saw, so a change made meanwhile is refused. */
export const pttypeMappingInputSchema = z.object({
  opd: sideSchema,
  ipd: sideSchema,
  expected: z.object({ opd: sideSchema, ipd: sideSchema }).strict()
}).strict();
export type PttypeMappingInput = z.infer<typeof pttypeMappingInputSchema>;
