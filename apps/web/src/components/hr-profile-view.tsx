import type { ProfileView } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { bangkokToday, formatBangkokDate, formatBangkokTime } from '../lib/bangkok-time';
import { dateFields, genderLabelKeys, profileFieldLabelKeys } from '../lib/hr-profile-labels';
import { ContactForm, ProfileForm, type ProfileFormUnit } from './hr-profile-forms';

const day = (value: string | null) => value ? formatBangkokDate(value) : t('notAssigned');
const text = (value: string | null) => value ?? t('notAssigned');
const historyValue = (field: string, value: string | null) => value === null ? t('notAssigned') : dateFields.has(field) ? formatBangkokDate(value) : value;

/** One person's profile boxes. Private boxes render only when the server returned private details. */
export function HrProfileView({ view, contactEndpoint, employmentTypes = [], units = [] }: { view: ProfileView; contactEndpoint: string; employmentTypes?: { id: string; name: string }[]; units?: ProfileFormUnit[] }) {
  const { work, private: personal, access, history } = view;
  const rows = (entries: [string, React.ReactNode][]) => <dl className="profile-summary">{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
  return <div className="profile">
    <section className="profile-box">
      <h3>{t('hrProfileWork')}</h3>
      {rows([
        [t('employeeCode'), text(work.employeeCode)], [t('hrFieldOrganization'), text(work.organizationName)], [t('hrFieldPositionTitle'), text(work.positionTitle)],
        [t('hrFieldPositionLevel'), text(work.positionLevel)], [t('hrFieldEmploymentType'), text(work.employmentTypeName)], [t('hrFieldAppointedOn'), day(work.appointedOn)],
        [t('employmentStatus'), work.employmentStatus === 'ACTIVE' ? t('employmentActive') : t('employmentInactive')]
      ])}
    </section>
    {personal ? <>
      <section className="profile-box">
        <h3>{t('hrProfilePersonal')}</h3>
        {rows([
          [t('hrFieldNamePrefix'), text(personal.namePrefix)], [t('hrFieldFirstName'), text(personal.firstName)], [t('hrFieldLastName'), text(personal.lastName)],
          [t('hrFieldGender'), personal.gender ? t(genderLabelKeys[personal.gender]) : t('notAssigned')], [t('hrFieldBirthDate'), day(personal.birthDate)]
        ])}
      </section>
      <section className="profile-box">
        <h3>{t('hrProfileContact')}</h3>
        {rows([
          [t('hrFieldPhone'), text(personal.phone)], [t('hrFieldAddress'), text(personal.address)], [t('hrFieldEmergencyContactName'), text(personal.emergencyContactName)],
          [t('hrFieldEmergencyContactRelationship'), text(personal.emergencyContactRelationship)], [t('hrFieldEmergencyContactPhone'), text(personal.emergencyContactPhone)]
        ])}
      </section>
    </> : null}
    {access.editProfile && personal ? <ProfileForm personId={work.personId} employmentTypes={employmentTypes} units={units} organizationName={work.organizationName} values={{
      namePrefix: personal.namePrefix, firstName: personal.firstName, lastName: personal.lastName, gender: personal.gender, birthDate: personal.birthDate,
      employmentTypeId: work.employmentTypeId, appointedOn: work.appointedOn, positionTitle: work.positionTitle, positionLevel: work.positionLevel, organizationId: work.organizationId
    }} /> : null}
    {access.editContact && personal ? <ContactForm endpoint={contactEndpoint} values={{ phone: personal.phone, address: personal.address, emergencyContactName: personal.emergencyContactName, emergencyContactRelationship: personal.emergencyContactRelationship, emergencyContactPhone: personal.emergencyContactPhone }} /> : null}
    <section className="profile-box">
      <h3>{t('hrProfileHistory')}</h3>
      {history.length === 0 ? <p>{t('hrNoProfileHistory')}</p> : <table>
        <thead><tr><th>{t('hrHistoryWhen')}</th><th>{t('hrHistoryWho')}</th><th>{t('hrHistoryWhat')}</th></tr></thead>
        <tbody>{history.map((change, index) => <tr key={`${change.at}-${index}`}>
          <td>{formatBangkokDate(bangkokToday(new Date(change.at)))} {formatBangkokTime(change.at)}</td>
          <td>{change.actorDisplayName ?? t('hrHistorySystem')}</td>
          <td><ul className="profile-changes">{change.changedFields.map((field) => {
            const label = profileFieldLabelKeys[field] ? t(profileFieldLabelKeys[field]) : field;
            const values = change.workChanges[field];
            return <li key={field}>{values ? `${label}: ${historyValue(field, values.from)} → ${historyValue(field, values.to)}` : label}</li>;
          })}</ul></td>
        </tr>)}</tbody>
      </table>}
    </section>
  </div>;
}
