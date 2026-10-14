# R0 HR master-data sign-off

Data Owner: HR

| Check | Result | Evidence/reference | Approver/date |
|---|---|---|---|
| People, organization, site, and location data reconciled |  |  |  |
| Historical reporting lines have effective dates |  |  |  |
| National-ID handling and masking reviewed |  |  |  |
| Access owners and delegation approvers assigned |  |  |  |

## Importing the data

HR imports people and organizations at `/hr/imports` (hospital-wide `hr-manager` who is also the HR data owner). Start from the header-only templates in `docs/pilot/hr-master-data-templates/`, save as "CSV UTF-8", check the files, fix every reported row, then import. An import with any invalid row saves nothing. Dates may be `2026-10-01` or `1/10/2569`. Each import is recorded in the audit log with counts only.
