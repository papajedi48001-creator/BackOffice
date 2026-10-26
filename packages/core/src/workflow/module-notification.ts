import { LEAVE_MODULE } from '../leave/leave-module';
import { OFFICIAL_TRAVEL_MODULE } from '../official-travel/travel-module';
import { REQUESTS_MODULE } from './requests-module';

/** Where an in-app notice about a คำขอ is filed and where it opens: leave and travel requests open their own pages, the rest stay in คำขอ. */
export function notificationTarget(moduleCode: string, requestId: string): { moduleCode: string; targetPath?: string } {
  if (moduleCode === LEAVE_MODULE) return { moduleCode: LEAVE_MODULE, targetPath: `/leave/requests/${requestId}` };
  if (moduleCode === OFFICIAL_TRAVEL_MODULE) return { moduleCode: OFFICIAL_TRAVEL_MODULE, targetPath: `/travel/requests/${requestId}` };
  return { moduleCode: REQUESTS_MODULE };
}
