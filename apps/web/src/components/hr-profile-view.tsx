import type { ProfileView } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { bangkokToday, formatBangkokDate, formatBangkokTime } from '../lib/bangkok-time';
import { dateFields, genderLabelKeys, maritalStatusLabelKeys, profileFieldLabelKeys } from '../lib/hr-profile-labels';
import { FamilyForm, Kp7FileForm } from './hr-kp7-forms';
import { CivilServiceForm, EducationForm, PositionHistoryForm } from './hr-kp7-service-forms';
import { ContactForm, PersonalForm, PhotoForm, ProfileForm, type ProfileFormPosition, type ProfileFormUnit } from './hr-profile-forms';
import { initialsOf } from '../lib/initials';
import { SectionEditor } from './section-editor';

const day = (value: string | null) => value ? formatBangkokDate(value) : t('notAssigned');
const text = (value: string | null) => value ?? t('notAssigned');
const baht = (value: number | null) => value === null ? t('notAssigned') : value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const historyValue = (field: string, value: string | null) => value === null ? t('notAssigned') : dateFields.has(field) ? formatBangkokDate(value) : value;

/** One person's profile boxes. Private boxes render only when the server returned private details. */
export function HrProfileView({ view, contactEndpoint, personalEndpoint, photo, personPhoto, employmentTypes = [], units = [], positions = [], uploadsEnabled = false }: { view: ProfileView; contactEndpoint: string; personalEndpoint?: string; photo?: { url: string | null; uploadsEnabled: boolean }; personPhoto?: { url: string | null; uploadsEnabled: boolean }; employmentTypes?: { id: string; name: string }[]; units?: ProfileFormUnit[]; positions?: ProfileFormPosition[]; uploadsEnabled?: boolean }) {
  const { work, private: personal, access, history } = view;
  const rows = (entries: [string, React.ReactNode][]) => <dl className="profile-summary">{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
  // `form` is shown in a popup from the box's แก้ไขข้อมูล button; `popup` is a form that already is its own popup with that button.
  const heading = (title: string, form: React.ReactNode, popup?: React.ReactNode) => <div className="profile-box-header"><h3>{title}</h3>{popup ?? (form ? <SectionEditor title={title}>{form}</SectionEditor> : null)}</div>;
  const profileForm = access.editProfile && personal ? <ProfileForm personId={work.personId} employmentTypes={employmentTypes} units={units} positions={positions} organizationName={work.organizationName} photo={personPhoto} values={{
    namePrefix: personal.namePrefix, firstName: personal.firstName, lastName: personal.lastName, gender: personal.gender, birthDate: personal.birthDate,
    employmentTypeId: work.employmentTypeId, appointedOn: work.appointedOn, positionTitle: work.positionTitle, positionLevel: work.positionLevel, organizationId: work.organizationId
  }} /> : null;
  const personalForm = profileForm ?? (personalEndpoint && personal ? <PersonalForm endpoint={personalEndpoint} values={{ namePrefix: personal.namePrefix, firstName: personal.firstName, lastName: personal.lastName, gender: personal.gender, birthDate: personal.birthDate }} /> : null);
  return <div className="profile">
    {personal ? <>
      <section className="profile-box">
        {heading(t('hrProfilePersonal'), null, personalForm)}
        {rows([
          [t('hrFieldNamePrefix'), text(personal.namePrefix)], [t('hrFieldFirstName'), text(personal.firstName)], [t('hrFieldLastName'), text(personal.lastName)],
          [t('hrFieldGender'), personal.gender ? t(genderLabelKeys[personal.gender]) : t('notAssigned')], [t('hrFieldBirthDate'), day(personal.birthDate)]
        ])}
      </section>
    </> : null}
    <section className="profile-box">
        {heading(t('hrProfileWork'), null)}
        {rows([
          [t('employeeCode'), text(work.employeeCode)], [t('hrFieldOrganization'), text(work.organizationName)], [t('hrFieldPositionTitle'), text(work.positionTitle)],
          [t('hrFieldPositionLevel'), text(work.positionLevel)], [t('hrFieldEmploymentType'), text(work.employmentTypeName)], [t('hrFieldAppointedOn'), day(work.appointedOn)],
          [t('employmentStatus'), work.employmentStatus === 'ACTIVE' ? t('employmentActive') : t('employmentInactive')]
        ])}
      </section>
    {personal ? <>
      <section className="profile-box">
        {heading(t('hrProfileContact'), null, access.editContact ? <ContactForm endpoint={contactEndpoint} values={{ phone: personal.phone, address: personal.address, emergencyContactName: personal.emergencyContactName, emergencyContactRelationship: personal.emergencyContactRelationship, emergencyContactPhone: personal.emergencyContactPhone }} /> : null)}
        {rows([
          [t('hrFieldPhone'), text(personal.phone)], [t('hrFieldAddress'), text(personal.address)], [t('hrFieldEmergencyContactName'), text(personal.emergencyContactName)],
          [t('hrFieldEmergencyContactRelationship'), text(personal.emergencyContactRelationship)], [t('hrFieldEmergencyContactPhone'), text(personal.emergencyContactPhone)]
        ])}
      </section>
      <section className="profile-box" aria-label={t('hrProfileFamily')}>
        {heading(t('hrProfileFamily'), access.editContact ? <FamilyForm endpoint={`/api/hr/people/${work.personId}/family`} values={{
          maritalStatus: personal.maritalStatus, religion: personal.religion, birthplace: personal.birthplace, fatherName: personal.fatherName, motherName: personal.motherName,
          motherMaidenName: personal.motherMaidenName, spouseName: personal.spouseName, spouseMaidenName: personal.spouseMaidenName, childrenCount: personal.childrenCount
        }} /> : null)}
        {rows([
          [t('hrFieldMaritalStatus'), personal.maritalStatus ? t(maritalStatusLabelKeys[personal.maritalStatus]) : t('notAssigned')], [t('hrFieldReligion'), text(personal.religion)], [t('hrFieldBirthplace'), text(personal.birthplace)],
          [t('hrFieldFatherName'), text(personal.fatherName)], [t('hrFieldMotherName'), text(personal.motherName)], [t('hrFieldMotherMaidenName'), text(personal.motherMaidenName)],
          [t('hrFieldSpouseName'), text(personal.spouseName)], [t('hrFieldSpouseMaidenName'), text(personal.spouseMaidenName)], [t('hrFieldChildrenCount'), personal.childrenCount === null ? t('notAssigned') : String(personal.childrenCount)]
        ])}
      </section>
      <section className="profile-box" aria-label={t('hrProfileCivilService')}>
        {heading(t('hrProfileCivilService'), access.editProfile ? <CivilServiceForm endpoint={`/api/hr/people/${work.personId}/civil-service`} values={personal.civilService} /> : null)}
        {rows([
          [t('hrFieldPositionNumber'), text(personal.civilService.positionNumber)],
          [t('hrFieldSalary'), personal.civilService.salary === null ? t('notAssigned') : personal.civilService.salary.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })],
          [t('hrFieldParentAgency'), text(personal.civilService.parentAgency)],
          [t('hrFieldGpf'), personal.civilService.gpfStatus === null ? t('notAssigned') : t(personal.civilService.gpfStatus === 'MEMBER' ? 'hrGpfMember' : 'hrGpfNotMember')],
          [t('hrFieldFirstAppointedOn'), day(personal.civilService.firstAppointedOn)], [t('hrFieldReappointedOn'), day(personal.civilService.reappointedOn)],
          [t('hrFieldTransferredInOn'), day(personal.civilService.transferredInOn)], [t('hrFieldTransferredOutOn'), day(personal.civilService.transferredOutOn)],
          [t('hrFieldJoinedUnitOn'), day(personal.civilService.joinedUnitOn)], [t('hrFieldCurrentLevelSince'), day(personal.civilService.currentLevelSince)],
          [t('hrFieldQualification'), text(personal.civilService.qualification)], [t('hrFieldQualificationMajor'), text(personal.civilService.qualificationMajor)],
          [t('hrFieldSpecialAllowance'), text(personal.civilService.specialAllowance)], [t('hrFieldRetirementDate'), day(personal.civilService.retirementDate)]
        ])}
      </section>
      <section className="profile-box" aria-label={t('hrProfileEducation')}>
        {heading(t('hrProfileEducation'), access.editContact ? <EducationForm endpoint={`/api/hr/people/${work.personId}/education`} entries={personal.education} /> : null)}
        {personal.education.length === 0 ? <p>{t('hrNoEducation')}</p> : <table>
          <thead><tr><th>{t('hrFieldGraduatedOn')}</th><th>{t('hrFieldDegree')}</th><th>{t('hrFieldMajor')}</th><th>{t('hrFieldInstitution')}</th><th>{t('hrFieldCountry')}</th></tr></thead>
          <tbody>{personal.education.map((entry, index) => <tr key={index}><td>{day(entry.graduatedOn)}</td><td>{entry.degree}</td><td>{text(entry.major)}</td><td>{text(entry.institution)}</td><td>{text(entry.country)}</td></tr>)}</tbody>
        </table>}
      </section>
      <section className="profile-box" aria-label={t('hrProfilePositionHistory')}>
        {heading(t('hrProfilePositionHistory'), access.editProfile ? <PositionHistoryForm endpoint={`/api/hr/people/${work.personId}/position-history`} entries={personal.positionHistory} /> : null)}
        {personal.positionHistory.length === 0 ? <p>{t('hrNoPositionHistory')}</p> : <table>
          <thead><tr><th>{t('hrFieldEffectiveOn')}</th><th>{t('hrFieldHistoryDescription')}</th><th>{t('hrFieldPositionNumber')}</th><th>{t('hrFieldPositionType')}</th><th>{t('hrFieldHistoryLevel')}</th><th>{t('hrFieldHistorySalary')}</th><th>{t('hrFieldPositionAllowance')}</th><th>{t('hrFieldReference')}</th></tr></thead>
          <tbody>{personal.positionHistory.map((entry, index) => <tr key={index}><td>{day(entry.effectiveOn)}</td><td>{entry.description}</td><td>{text(entry.positionNumber)}</td><td>{text(entry.positionType)}</td><td>{text(entry.level)}</td><td>{baht(entry.salary)}</td><td>{baht(entry.positionAllowance)}</td><td>{text(entry.reference)}</td></tr>)}</tbody>
        </table>}
      </section>
      <Kp7FileForm endpoint={access.editContact ? `/api/hr/people/${work.personId}/kp7` : undefined} file={personal.kp7File} uploadsEnabled={uploadsEnabled} />
    </> : null}
    {photo ? <PhotoForm photoUrl={photo.url} initials={initialsOf(work.displayName)} uploadsEnabled={photo.uploadsEnabled} /> : null}
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
