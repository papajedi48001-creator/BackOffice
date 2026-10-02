# Workflow in-app notifications design

**Status:** approved design, pending implementation plan

**Date:** 2026-10-02
**Scope:** notifications for maintenance-request workflow transitions only

## Purpose

Provide a Thai-first in-app notification for the person who must act next in a
maintenance request workflow, and for the requestor when the workflow reaches
a final outcome. The feature must be durable, private, and safe to retry.

This design applies only to requests and decisions created after the feature is
released. It does not replay historical workflow events.

## Agreed user behaviour

| Workflow action | Request status | Recipient of new in-app notification |
| --- | --- | --- |
| Submit request | `IN_REVIEW` | First approver |
| Approve a non-final step | stays `IN_REVIEW` | Next approver |
| Approve the final step | `APPROVED` | Requestor |
| Reject a step | `REJECTED` | Requestor |
| Return a step | `RETURNED` | Requestor |

After `APPROVED`, `REJECTED`, or `RETURNED`, the request is final. The service
must reject any later decision attempt. Remaining approval steps are no longer
actionable.

## Event and storage design

The workflow remains the source of truth for workflow events. Each successful
transition additionally writes a dedicated `notification.in_app` outbox event
in the same database transaction as the request and approval changes.

The event payload contains only the minimal delivery and navigation data:

- `recipientPersonId`
- `requestId`
- Thai short subject suitable for a notification list

It must not include the decision reason, clinical information, or other
sensitive request details.

The worker consumes only `notification.in_app` events. It records an in-app
notification with its recipient, subject, linked request, creation time, and
optional `read_at` time, then marks the source outbox event processed. A unique
database constraint on `(outbox_event_id, channel)` makes retrying safe across
worker restarts.

Existing unprocessed `workflow.request.submitted` and
`workflow.request.decided` rows are intentionally left untouched. The worker's
existing filter continues to exclude them; they create no historical
notifications.

## API, authorization, and user interface

Add a Thai sidebar entry named `การแจ้งเตือน` with an unread count. The page
shows only notifications whose recipient is the authenticated person, newest
first. Each row shows a short message, time, and read state.

Opening a notification marks it read and navigates to its linked request. Both
the notification endpoints and the request page must enforce the current
person's authorization. A person cannot list, mark read, or inspect another
person's notifications or linked request through a guessed identifier.

The API supports:

- listing the current person's notifications;
- obtaining that person's unread count; and
- marking one of that person's notifications read.

No email, push delivery, notification preferences, bulk mark-as-read action,
or historical replay is included in this scope.

## Reliability and failure handling

The request transition and notification outbox record are atomic. If either
cannot be saved, neither becomes visible as completed. If delivery fails after
the transaction, the unprocessed outbox event remains available for retry.
The database uniqueness rule prevents duplicate list entries when a worker is
restarted or retries a delivery.

Event producers validate the notification shape before persisting it. Worker
failures must be observable in logs without exposing sensitive payload fields.

## Verification and rollout

Implementation verification must cover:

1. submit creates a notification for the first approver;
2. a non-final approval preserves `IN_REVIEW` and notifies the next approver;
3. final approval, rejection, and return notify only the requestor;
4. a final request refuses later decisions;
5. worker retry does not duplicate a notification;
6. notification listing, unread count, read action, and linked-request access
   enforce recipient authorization; and
7. Thai UI states for unread, read, empty, and access-denied behaviour.

Release first to staging. Validate using newly created requests after release;
do not use the twelve pre-feature workflow rows as notification test data.

## Baseline note

On 2026-10-02, `pnpm test` in the isolated workspace stopped in the existing
database schema integration suite because local MariaDB rejected the configured
`backoffice` account at `127.0.0.1`. This is an environment prerequisite, not a
verification result for this design-only document. The implementation plan must
run the affected tests against a configured local or CI database.
