import Link from 'next/link';
import type { ModuleMode } from '@backoffice/contracts';
import { t } from '@backoffice/i18n';
import type { DashboardSummary } from '@backoffice/core';
import { moduleRegistry, type ModuleEntry } from '../lib/modules';
import { ModuleIcon } from './module-icon';

export interface LauncherSummary extends Pick<DashboardSummary, 'displayName' | 'greetingName' | 'organizationName'> { pendingApprovals: number | null; unreadNotifications: number | null; }

const registryOrder = (entry: ModuleEntry) => moduleRegistry.findIndex((candidate) => candidate.code === entry.code);
const thaiDate = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });

function Badge({ count }: { count: number | null | undefined }) {
  if (!count) return null;
  return <span className="module-badge" aria-label={`${count} ${t('launcherBadgeSuffix')}`}>{count}</span>;
}

function Tile({ entry, count, development }: { entry: ModuleEntry; count: number | null | undefined; development: boolean }) {
  const body = <><span className="module-icon" data-group={entry.status === 'planned' ? 'planned' : entry.group}><ModuleIcon name={entry.icon} /></span><span className="module-text"><strong>{t(entry.labelKey)}</strong><span>{t(entry.descriptionKey)}</span></span></>;
  if (entry.status === 'planned') return <div className="module-tile is-planned" aria-disabled="true">{body}<span className="soon-tag">{t('launcherComingSoon')}</span></div>;
  // A module in development (ตั้งค่าโปรแกรม) carries a text ribbon as well as the amber striped border, so it never relies on colour.
  return <Link className={`module-tile${development ? ' is-development' : ''}`} data-module={entry.code} href={entry.href}>{body}{development ? <span className="dev-ribbon">{t('moduleInDevelopment')}</span> : null}{count ? <Badge count={count} /> : <span className="module-go" aria-hidden="true">→</span>}</Link>;
}

export function ModuleLauncher({ modules, modes = {}, badges, summary, today }: { modules: ModuleEntry[]; modes?: Readonly<Record<string, ModuleMode>>; badges: Record<string, number | undefined>; summary: LauncherSummary; today: Date }) {
  const countFor = (entry: ModuleEntry) => entry.code === 'requests' ? summary.pendingApprovals : entry.code === 'notifications' ? summary.unreadNotifications : badges[entry.code];
  // One flat grid of what the person can open, in registry order; no grouping by type.
  const live = modules.filter((entry) => entry.status === 'live').sort((a, b) => registryOrder(a) - registryOrder(b));
  // Only ผู้ดูแลระบบ are given planned modules (visibleModules), so the strip shows for them alone.
  const planned = modules.filter((entry) => entry.status === 'planned');
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
      {live.length > 0 && <ul className="module-grid launcher-grid">{live.map((entry) => <li key={entry.code}><Tile entry={entry} count={countFor(entry)} development={modes[entry.code] === 'DEVELOPMENT'} /></li>)}</ul>}
      {planned.length > 0 && <section className="module-group" aria-labelledby="launcher-planned"><h3 id="launcher-planned">{t('launcherGroupPlanned')}</h3><ul className="module-grid">{planned.map((entry) => <li key={entry.code}><Tile entry={entry} count={undefined} development={false} /></li>)}</ul></section>}
    </nav>
  </div>;
}
