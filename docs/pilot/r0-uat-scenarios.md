# R0 UAT scenarios

| Scenario | Evidence required | Result | Data Owner sign-off |
|---|---|---|---|
| Scoped access | User outside organization is denied server-side |  |  |
| Local login and session | Local account authenticates; OIDC remains optional |  |  |
| Workflow | Submit, approve, return, reject, and cancel record actor/time/reason |  |  |
| Delegation | Valid delegation works; self/conflict approval is denied |  |  |
| Masking/export | National ID remains masked; export needs separate right and audit entry |  |  |
| Attachment rejection | Unsupported/unscanned attachment is rejected or fails closed |  |  |
| Restore drill | Encrypted backup restores to isolated staging with evidence |  |  |
| In-app notification: first approver | Create a new two-step maintenance request after this release; only the first approver receives one unread notification |  |  |
| In-app notification: intermediate approval | Approve step 1; request remains `IN_REVIEW` and only the next approver receives one unread notification |  |  |
| In-app notification: final approval | Approve the final step; requestor receives one unread approval notification |  |  |
| In-app notification: reject and return | On separate new requests, reject and return; requestor receives the corresponding final notification without decision reason |  |  |
| In-app notification: read flow | Open a notification; its unread count decreases and the linked request opens |  |  |
| In-app notification: recipient isolation | A different signed-in person cannot list, read, or open a guessed notification/request identifier |  |  |
| In-app notification: historical events | Confirm the twelve workflow rows that existed before this release created no notifications and remain unprocessed |  |  |
