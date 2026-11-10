import type { Metadata } from 'next';
import { MciQueries } from '@backoffice/core';
import { getSharedDatabase } from '../../../lib/database';
import { mciText } from '../../../lib/mci-labels';
import { BoardView } from './board-view';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: mciText.boardTitle, robots: { index: false, follow: false } };

/** กระดานสาธารณะ at /mci/board: no sign-in, for relatives and the public. Only the public projection is read (see buildPublicBoard). */
export default async function MciBoardPage() {
  const database = getSharedDatabase();
  if (!database) return <main className="mci-board-shell"><p role="alert">{mciText.loadError}</p></main>;
  const board = await new MciQueries(database).publicBoard();
  return <main className="mci-board-shell" data-module="mass-casualty"><BoardView initial={board} /></main>;
}
