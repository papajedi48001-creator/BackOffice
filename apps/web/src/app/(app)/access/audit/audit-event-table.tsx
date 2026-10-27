import { t } from '@backoffice/i18n';

export type AuditEventRow = {
  createdAt: string;
  action: 'workflow.request.submitted' | 'workflow.request.decided' | 'workflow.request.cancelled' | 'workflow.request.resubmitted'
    | 'inventory.category.created' | 'inventory.category.updated' | 'inventory.item.created' | 'inventory.item.updated' | 'inventory.vendor.created' | 'inventory.vendor.updated'
    | 'inventory.opening.submitted' | 'inventory.opening.returned' | 'inventory.opening.certified' | 'inventory.receipt.posted' | 'inventory.receipt.voided'
    | 'fleet.request.submitted' | 'fleet.request.resubmitted' | 'fleet.request.cancelled' | 'fleet.request.assigned' | 'fleet.request.unassigned' | 'fleet.request.declined'
    | 'fleet.trip.updated' | 'fleet.trip.departed' | 'fleet.trip.returned' | 'fleet.trip.cancelled' | 'fleet.vehicle.create' | 'fleet.vehicle.update' | 'fleet.driver.create' | 'fleet.driver.update';
  result: 'SUCCESS' | 'APPROVE' | 'REJECT' | 'RETURN';
  requestReference: string | null;
};

const actionLabels: Record<AuditEventRow['action'], string> = {
  'workflow.request.submitted': t('auditRequestSubmitted'),
  'workflow.request.decided': t('auditRequestDecided'),
  'workflow.request.cancelled': t('auditRequestCancelled'),
  'workflow.request.resubmitted': t('auditRequestResubmitted'),
  'inventory.category.created': t('auditInventoryCategoryCreated'),
  'inventory.category.updated': t('auditInventoryCategoryUpdated'),
  'inventory.item.created': t('auditInventoryItemCreated'),
  'inventory.item.updated': t('auditInventoryItemUpdated'),
  'inventory.vendor.created': t('auditInventoryVendorCreated'),
  'inventory.vendor.updated': t('auditInventoryVendorUpdated'),
  'inventory.opening.submitted': t('auditInventoryOpeningSubmitted'),
  'inventory.opening.returned': t('auditInventoryOpeningReturned'),
  'inventory.opening.certified': t('auditInventoryOpeningCertified'),
  'inventory.receipt.posted': t('auditInventoryReceiptPosted'),
  'inventory.receipt.voided': t('auditInventoryReceiptVoided'),
  'fleet.request.submitted': t('auditFleetRequestSubmitted'),
  'fleet.request.resubmitted': t('auditFleetRequestResubmitted'),
  'fleet.request.cancelled': t('auditFleetRequestCancelled'),
  'fleet.request.assigned': t('auditFleetRequestAssigned'),
  'fleet.request.unassigned': t('auditFleetRequestUnassigned'),
  'fleet.request.declined': t('auditFleetRequestDeclined'),
  'fleet.trip.updated': t('auditFleetTripUpdated'),
  'fleet.trip.departed': t('auditFleetTripDeparted'),
  'fleet.trip.returned': t('auditFleetTripReturned'),
  'fleet.trip.cancelled': t('auditFleetTripCancelled'),
  'fleet.vehicle.create': t('auditFleetVehicleCreate'),
  'fleet.vehicle.update': t('auditFleetVehicleUpdate'),
  'fleet.driver.create': t('auditFleetDriverCreate'),
  'fleet.driver.update': t('auditFleetDriverUpdate')
};
export const auditActionNames = Object.keys(actionLabels) as AuditEventRow['action'][];

const resultLabels: Record<AuditEventRow['result'], string> = {
  SUCCESS: t('auditResultSuccess'),
  APPROVE: t('auditResultApproved'),
  REJECT: t('auditResultRejected'),
  RETURN: t('auditResultReturned')
};

export function AuditEventTable({ events }: { events: AuditEventRow[] }) {
  if (!events.length) return <p>{t('noAuditData')}</p>;
  return <table><thead><tr><th>{t('auditTime')}</th><th>{t('auditAction')}</th><th>{t('requestReference')}</th><th>{t('auditResult')}</th></tr></thead><tbody>{events.map((event) => <tr key={`${event.createdAt}-${event.action}-${event.requestReference ?? 'unknown'}`}><td>{new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date(event.createdAt))}</td><td>{actionLabels[event.action]}</td><td>{event.requestReference ?? t('unknownRequest')}</td><td>{resultLabels[event.result]}</td></tr>)}</tbody></table>;
}
