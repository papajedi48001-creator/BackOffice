import type { Gender } from '@backoffice/contracts';
import type { MessageKey } from '@backoffice/i18n';

/** Thai labels for profile fields, as named in forms and in change history. */
export const profileFieldLabelKeys: Record<string, MessageKey> = {
  namePrefix: 'hrFieldNamePrefix', firstName: 'hrFieldFirstName', lastName: 'hrFieldLastName', gender: 'hrFieldGender', birthDate: 'hrFieldBirthDate',
  phone: 'hrFieldPhone', address: 'hrFieldAddress', emergencyContactName: 'hrFieldEmergencyContactName', emergencyContactRelationship: 'hrFieldEmergencyContactRelationship', emergencyContactPhone: 'hrFieldEmergencyContactPhone',
  employmentType: 'hrFieldEmploymentType', appointedOn: 'hrFieldAppointedOn', positionTitle: 'hrFieldPositionTitle', positionLevel: 'hrFieldPositionLevel', organization: 'hrFieldOrganization'
};

export const genderLabelKeys: Record<Gender, MessageKey> = { MALE: 'hrGenderMale', FEMALE: 'hrGenderFemale' };

/** Work fields whose history values are calendar days. */
export const dateFields = new Set(['appointedOn']);
