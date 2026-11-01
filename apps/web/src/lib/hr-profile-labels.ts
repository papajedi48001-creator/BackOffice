import type { Gender, MaritalStatus } from '@backoffice/contracts';
import type { MessageKey } from '@backoffice/i18n';

/** Thai labels for profile fields, as named in forms and in change history. */
export const profileFieldLabelKeys: Record<string, MessageKey> = {
  namePrefix: 'hrFieldNamePrefix', firstName: 'hrFieldFirstName', lastName: 'hrFieldLastName', gender: 'hrFieldGender', birthDate: 'hrFieldBirthDate',
  phone: 'hrFieldPhone', address: 'hrFieldAddress', emergencyContactName: 'hrFieldEmergencyContactName', emergencyContactRelationship: 'hrFieldEmergencyContactRelationship', emergencyContactPhone: 'hrFieldEmergencyContactPhone',
  employmentType: 'hrFieldEmploymentType', appointedOn: 'hrFieldAppointedOn', positionTitle: 'hrFieldPositionTitle', positionLevel: 'hrFieldPositionLevel', organization: 'hrFieldOrganization', photo: 'hrFieldPhoto',
  maritalStatus: 'hrFieldMaritalStatus', religion: 'hrFieldReligion', birthplace: 'hrFieldBirthplace', fatherName: 'hrFieldFatherName', motherName: 'hrFieldMotherName', motherMaidenName: 'hrFieldMotherMaidenName',
  spouseName: 'hrFieldSpouseName', spouseMaidenName: 'hrFieldSpouseMaidenName', childrenCount: 'hrFieldChildrenCount', kp7File: 'hrKp7File'
};

export const maritalStatusLabelKeys: Record<MaritalStatus, MessageKey> = { SINGLE: 'hrMaritalSingle', MARRIED: 'hrMaritalMarried', DIVORCED: 'hrMaritalDivorced', SEPARATED: 'hrMaritalSeparated', WIDOWED: 'hrMaritalWidowed' };

export const genderLabelKeys: Record<Gender, MessageKey> = { MALE: 'hrGenderMale', FEMALE: 'hrGenderFemale' };

/** Work fields whose history values are calendar days. */
export const dateFields = new Set(['appointedOn']);
