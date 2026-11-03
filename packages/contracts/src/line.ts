import { z } from 'zod';
import { notificationModuleCodeSchema, notificationTargetPathSchema } from './notifications.ts';

/** A LINE group id as the Messaging API gives it: `C` and 32 lowercase hex digits. */
export const lineGroupIdSchema = z.string().regex(/^C[0-9a-f]{32}$/);
/** A LINE user id, the only handle an @mention accepts (not the LINE ID a person types). */
export const lineUserIdSchema = z.string().regex(/^U[0-9a-f]{32}$/);
/** เพิ่มกลุ่ม LINE เอง: a group the bot is in, typed by ผู้ดูแลระบบ when the webhook cannot reach the system. */
export const lineGroupInputSchema = z.object({ groupId: z.string().trim().pipe(lineGroupIdSchema), displayName: z.string().trim().min(1).max(120) });
/** กลุ่มแจ้งเตือนของโมดูล: one group, or null for "ไม่ส่ง LINE". */
export const lineRouteInputSchema = z.object({ groupId: lineGroupIdSchema.nullable() });
/** The `notification.line` outbox payload: ids and an in-app path only, never text a person wrote. */
export const lineAlertPayloadSchema = z.object({ recipientPersonId: z.string().min(1), moduleCode: notificationModuleCodeSchema, targetPath: notificationTargetPathSchema });
export type LineAlertPayload = z.infer<typeof lineAlertPayloadSchema>;
