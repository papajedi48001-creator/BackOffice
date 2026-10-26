import { LEAVE_MODULE } from '../leave/leave-module';
import { REQUESTS_MODULE } from './requests-module';

/** Where an in-app notice about a คำขอ is filed and where it opens: leave requests open their ใบลา page, the rest stay in คำขอ. */
export function notificationTarget(moduleCode: string, requestId: string): { moduleCode: string; targetPath?: string } {
  if (moduleCode === LEAVE_MODULE) return { moduleCode: LEAVE_MODULE, targetPath: `/leave/requests/${requestId}` };
  return { moduleCode: REQUESTS_MODULE };
}
