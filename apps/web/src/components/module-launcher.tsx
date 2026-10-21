import Link from 'next/link';
import { t, type MessageKey } from '@backoffice/i18n';
import type { DashboardSummary } from '@backoffice/core';
import type { ModuleEntry, ModuleGroup } from '../lib/modules';
import { ModuleIcon } from './module-icon';

export interface LauncherSummary extends Pick<DashboardSummary, 'displayName' | 'organizationName'> { pendingApprovals: number | null; unreadNotifications: number | null; }

const groups: Array<[ModuleGroup, MessageKey]> = [['mine', 'launcherGroupMine'], ['people', 'launcherGroupPeople'], ['services', 'launcherGroupServices'], ['governance', 'launcherGroupGovernance']];
const thaiDate = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });

function Badge({ count }: { count: number | null | undefined }) {
  if (!count) return null;
  return <span className="module-badge" aria-label={`${count} ${t('launcherBadgeSuffix')}`}>{count}</span>;
}

function Tile({ entry, count }: { entry: ModuleEntry; count: number | null | undefined }) {
  const body = <><span className="module-icon" data-group={entry.status === 'planned' ? 'planned' : entry.group}><ModuleIcon name={entry.icon} /></span><span className="module-text"><strong>{t(entry.labelKey)}</strong><span>{t(entry.descriptionKey)}</span></span></>;
  if (entry.status === 'planned') return <div className="module-tile is-planned" aria-disabled="true">{body}<span className="soon-tag">{t('launcherComingSoon')}</span></div>;
  return <Link className="module-tile" href={entry.href}>{body}{count ? <Badge count={count} /> : <span className="module-go" aria-hidden="true">→</span>}</Link>;
}

function Section({ id, title, entries, countFor }: { id: string; title: string; entries: ModuleEntry[]; countFor: (entry: ModuleEntry) => number | null | undefined }) {
  if (!entries.length) return null;
  return <section className="module-group" aria-labelledby={id}><h3 id={id}>{title}</h3><ul className="module-grid">{entries.map((entry) => <li key={entry.code}><Tile entry={entry} count={countFor(entry)} /></li>)}</ul></section>;
}

export function ModuleLauncher({ modules, badges, summary, today }: { modules: ModuleEntry[]; badges: Record<string, number | undefined>; summary: LauncherSummary; today: Date }) {
  const countFor = (entry: ModuleEntry) => entry.code === 'requests' ? summary.pendingApprovals : entry.code === 'notifications' ? summary.unreadNotifications : badges[entry.code];
  const live = modules.filter((entry) => entry.status === 'live');
  const greeting = summary.displayName ? `${t('launcherGreeting')} ${summary.displayName}` : t('launcherGreeting');
  const stat = (value: number | null) => value === null ? '–' : String(value);
  return <div className="launcher">
    <section className="launcher-hero">
      <div><p className="eyebrow">{thaiDate.format(today)}</p><h2>{greeting}</h2><p className="hero-copy">{summary.organizationName ? `${summary.organizationName} · ` : ''}{t('launcherHint')}</p></div>
      <div className="hero-stats">
        <Link className={`hero-stat${summary.pendingApprovals ? ' is-alert' : ''}`} href="/requests"><strong>{stat(summary.pendingApprovals)}</strong><span>{t('launcherPendingApprovals')}</span></Link>
        <Link className="hero-stat" href="/notifications"><strong>{stat(summary.unreadNotifications)}</strong><span>{t('launcherUnreadNotifications')}</span></Link>
      </div>
    </section>
    <nav aria-label={t('launcherModulesLabel')}>
      {groups.map(([group, title]) => <Section key={group} id={`launcher-${group}`} title={t(title)} entries={live.filter((entry) => entry.group === group)} countFor={countFor} />)}
      <Section id="launcher-planned" title={t('launcherGroupPlanned')} entries={modules.filter((entry) => entry.status === 'planned')} countFor={() => undefined} />
    </nav>
  </div>;
}
