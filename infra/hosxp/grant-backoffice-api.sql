-- สิทธิของ backoffice_api บน HOSxP: every table BackOffice reads or writes there.
-- Run as root on the HOSxP MySQL/MariaDB. Change `hos` below if the HOSxP database has another name.
-- Safe to run again: a grant the account already holds changes nothing.
-- packages/core/src/hosxp-grants.test.ts fails when code reads a HOSxP table that is not listed here,
-- so a change that adds a table must add its GRANT line in the same pull request.

USE hos;

-- วันหยุด (holidays)
GRANT SELECT ON holiday TO 'backoffice_api'@'%';

-- Smart Money: ทันตกรรม, แพทย์แผนไทย, การจ่ายยาสมุนไพร
GRANT SELECT ON doctor TO 'backoffice_api'@'%';
GRANT SELECT ON drugitems TO 'backoffice_api'@'%';
GRANT SELECT ON dtmain TO 'backoffice_api'@'%';
GRANT SELECT ON health_med_doctor TO 'backoffice_api'@'%';
GRANT SELECT ON health_med_service TO 'backoffice_api'@'%';
GRANT SELECT ON health_med_service_type TO 'backoffice_api'@'%';
GRANT SELECT ON health_med_treatment_type TO 'backoffice_api'@'%';
GRANT SELECT ON icd101 TO 'backoffice_api'@'%';
GRANT SELECT ON income TO 'backoffice_api'@'%';
GRANT SELECT ON ipt TO 'backoffice_api'@'%';
GRANT SELECT ON nondrugitems TO 'backoffice_api'@'%';
GRANT SELECT ON opitemrece TO 'backoffice_api'@'%';
GRANT SELECT ON ovst TO 'backoffice_api'@'%';
GRANT SELECT ON ovstdiag TO 'backoffice_api'@'%';
GRANT SELECT ON patient TO 'backoffice_api'@'%';
GRANT SELECT ON vn_stat TO 'backoffice_api'@'%';

-- Mapping สิทธิ / ผูกผังบัญชี (also read by ทันตกรรม). Writes go only to the two mapping tables.
GRANT SELECT ON paccount TO 'backoffice_api'@'%';
GRANT SELECT ON pttype TO 'backoffice_api'@'%';
GRANT SELECT, INSERT, DELETE ON paccountopd TO 'backoffice_api'@'%';
GRANT SELECT, INSERT, DELETE ON paccountipd TO 'backoffice_api'@'%';

FLUSH PRIVILEGES;
