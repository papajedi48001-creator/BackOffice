'use client';

import { useEffect, useId, useState } from 'react';
import type { PublicBoard } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { BrandLogo } from '../../../components/brand-logo';
import { formatBangkokDateTime, formatBangkokTime } from '../../../lib/bangkok-time';
import { mciText } from '../../../lib/mci-labels';

const POLL_MS = 30_000;
const CONTACT_PLACE = 'กรุณาติดต่อจุดประชาสัมพันธ์';

/** Which pill a place reads as: a zone, a referral, sent home, or "ask the PR desk" (deceased or hidden). */
function placeKind(place: string): 'zone' | 'refer' | 'home' | 'contact' {
  if (place === CONTACT_PLACE) return 'contact';
  if (place.startsWith('ส่งต่อ')) return 'refer';
  if (place === 'กลับบ้านแล้ว') return 'home';
  return 'zone';
}

function ContactCard({ phone }: { phone: string }) {
  if (!phone) return null;
  return <a className="mci-board-call" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
    <span className="mci-board-call-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" /></svg>
    </span>
    <span><small>{mciText.boardContact}</small><strong>{phone}</strong></span>
  </a>;
}

/**
 * กระดานสาธารณะ: counts by colour and by status, and the named casualties with where they are. No colour per person;
 * the deceased and hidden casualties read only the contact place. Refreshes itself every 30 seconds while `poll` is on.
 */
export function BoardView({ initial, poll = true }: { initial: PublicBoard; poll?: boolean }) {
  const [board, setBoard] = useState(initial);
  const [query, setQuery] = useState('');
  const searchId = useId();
  useEffect(() => {
    if (!poll) return;
    const timer = setInterval(() => {
      void fetch('/api/mci/board', { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() as Promise<PublicBoard> : null))
        .then((next) => { if (next) setBoard(next); })
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  const brand = <div className="mci-board-brand">
    <BrandLogo size={44} decorative />
    <div><p>{t('hospitalName')}</p><strong>{mciText.boardTitle}</strong></div>
  </div>;

  if (!board.incident) {
    return <section className="mci-board">
      <header className="mci-board-hero mci-board-hero-calm">{brand}</header>
      <div className="mci-board-empty">
        <span className="mci-board-empty-icon" aria-hidden="true">✓</span>
        <p>{mciText.noIncident}</p>
      </div>
      <ContactCard phone={board.contactPhone} />
    </section>;
  }

  const words = query.trim().toLowerCase();
  const people = words ? board.people.filter((person) => person.name.toLowerCase().includes(words)) : board.people;
  const total = Math.max(board.total, 1);
  return <section className="mci-board">
    {board.incident.kind === 'DRILL' && <p className="mci-drill-banner" role="note">{mciText.drillBanner}</p>}
    <header className="mci-board-hero">
      {brand}
      <h1>{board.incident.title}</h1>
      <p className="mci-board-meta">
        <span>{mciText.occurredAt} {formatBangkokDateTime(board.incident.occurredAt)}</span>
        {board.updatedAt && <span className="mci-board-live"><span className="mci-live-dot" aria-hidden="true" />{mciText.boardUpdated} {formatBangkokTime(board.updatedAt)} น.</span>}
      </p>
    </header>

    <div className="mci-board-summary">
      <div className="mci-board-total"><span>{mciText.boardTotal}</span> <strong>{board.total}</strong> <small>คน</small></div>
      <ContactCard phone={board.contactPhone} />
    </div>

    {board.byTriage.length > 0 && <div className="mci-board-bar" aria-hidden="true">
      {board.byTriage.filter((level) => level.count > 0).map((level) => <span key={level.name} style={{ '--triage': level.colorHex, flexGrow: level.count / total } as React.CSSProperties} />)}
    </div>}
    <ul className="mci-board-triage" aria-label={mciText.boardByTriage}>
      {board.byTriage.map((level) => <li key={level.name} style={{ '--triage': level.colorHex } as React.CSSProperties}>
        <span className="mci-board-triage-name"><span className="mci-triage-swatch" aria-hidden="true" />{level.name}</span>
        <strong>{level.count}</strong>
      </li>)}
    </ul>

    {board.byStatus.length > 0 && <section className="mci-board-section" aria-labelledby={`${searchId}-status`}>
      <h2 id={`${searchId}-status`}>{mciText.boardByStatus}</h2>
      <ul className="mci-board-status" aria-label={mciText.boardByStatus}>
        {board.byStatus.map((status) => <li key={status.name}><strong>{status.count}</strong><span>{status.name}</span></li>)}
      </ul>
    </section>}

    <section className="mci-board-section mci-board-people" aria-labelledby={`${searchId}-title`}>
      <div className="mci-board-people-head">
        <h2 id={`${searchId}-title`}>{mciText.boardPeople}</h2>
        {words && <span className="mci-board-match">พบ {people.length} คน</span>}
      </div>
      <label htmlFor={searchId}>{mciText.boardSearch}</label>
      <div className="mci-board-search">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input id={searchId} type="search" value={query} placeholder="พิมพ์ชื่อหรือนามสกุล" onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
      </div>
      {board.people.length === 0 ? <p className="mci-board-note">{mciText.boardNoPeople}</p>
        : people.length === 0 ? <p className="mci-board-note">{mciText.boardNoMatch}</p>
          : <table>
            <thead><tr><th scope="col">{mciText.boardName}</th><th scope="col">{mciText.boardPlace}</th></tr></thead>
            <tbody>{people.map((person, index) => <tr key={`${person.name}-${index}`}>
              <td><span className="mci-board-person"><span className="mci-board-avatar" aria-hidden="true">{Array.from(person.name)[0]}</span><span className="mci-board-name">{person.name}</span></span></td>
              <td><span className={`mci-place mci-place-${placeKind(person.place)}`}>{person.place}</span></td>
            </tr>)}</tbody>
          </table>}
    </section>
    <footer className="mci-board-footer">{mciText.boardRefresh} · {t('hospitalName')}</footer>
  </section>;
}
