'use client';

import { useEffect, useId, useState } from 'react';
import type { PublicBoard } from '@backoffice/core';
import { formatBangkokDateTime } from '../../../lib/bangkok-time';
import { mciText } from '../../../lib/mci-labels';

const POLL_MS = 30_000;

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

  const contact = board.contactPhone ? <p className="mci-board-contact">{mciText.boardContact} โทร {board.contactPhone}</p> : null;
  if (!board.incident) {
    return <section className="mci-board">
      <h1>{mciText.boardTitle}</h1>
      <p className="mci-board-empty">{mciText.noIncident}</p>
      {contact}
    </section>;
  }
  const words = query.trim().toLowerCase();
  const people = words ? board.people.filter((person) => person.name.toLowerCase().includes(words)) : board.people;
  return <section className="mci-board">
    {board.incident.kind === 'DRILL' && <p className="mci-drill-banner" role="note">{mciText.drillBanner}</p>}
    <header className="mci-board-header">
      <p className="mci-board-kicker">{mciText.boardTitle}</p>
      <h1>{board.incident.title}</h1>
      <p className="muted">{mciText.occurredAt} {formatBangkokDateTime(board.incident.occurredAt)}{board.updatedAt ? ` · ${mciText.boardUpdated} ${formatBangkokDateTime(board.updatedAt)}` : null}</p>
    </header>
    {contact}
    <div className="mci-board-total"><span>{mciText.boardTotal}</span> <strong>{board.total}</strong></div>
    <ul className="mci-triage-counts" aria-label={mciText.boardByTriage}>
      {board.byTriage.map((level) => <li key={level.name} style={{ '--triage': level.colorHex } as React.CSSProperties}>
        <span className="mci-triage-swatch" aria-hidden="true" />
        <span className="mci-triage-name">{level.name}</span>
        <strong className="mci-triage-count">{level.count}</strong>
      </li>)}
    </ul>
    {board.byStatus.length > 0 && <ul className="mci-status-counts" aria-label={mciText.boardByStatus}>
      {board.byStatus.map((status) => <li key={status.name}><span>{status.name}</span> <strong>{status.count}</strong></li>)}
    </ul>}
    <section className="mci-board-people" aria-labelledby={`${searchId}-title`}>
      <h2 id={`${searchId}-title`}>{mciText.boardPeople}</h2>
      <label htmlFor={searchId}>{mciText.boardSearch}</label>
      <input id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
      {board.people.length === 0 ? <p className="muted">{mciText.boardNoPeople}</p>
        : people.length === 0 ? <p className="muted">{mciText.boardNoMatch}</p>
          : <table>
            <thead><tr><th scope="col">{mciText.boardName}</th><th scope="col">{mciText.boardPlace}</th></tr></thead>
            <tbody>{people.map((person, index) => <tr key={`${person.name}-${index}`}><td>{person.name}</td><td>{person.place}</td></tr>)}</tbody>
          </table>}
    </section>
    <p className="muted mci-board-refresh">{mciText.boardRefresh}</p>
  </section>;
}
