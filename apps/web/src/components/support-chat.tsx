'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupportConversationSummary } from '@backoffice/contracts';
import { t } from '@backoffice/i18n';
import { formatBangkokDateTime } from '../lib/bangkok-time';
import { SupportChatWindow, type ChatEndpoints } from './support-chat-window';

// Fallbacks only: the live stream normally brings every change at once.
const SUMMARY_POLL_MS = 30_000;
const INBOX_POLL_MS = 15_000;
/** How many conversations ผู้ดูแลระบบ keep open side by side; opening one more closes the oldest. */
export const MAX_OPEN_CHATS = 3;

const mine: ChatEndpoints = { load: '/api/support-chat/mine', send: '/api/support-chat/mine/messages', read: '/api/support-chat/mine/read' };
const conversation = (id: string): ChatEndpoints => ({ load: `/api/support-chat/conversations/${id}`, send: `/api/support-chat/conversations/${id}/messages`, read: `/api/support-chat/conversations/${id}/read` });

/**
 * แชตกับผู้ดูแลระบบ: the round button at the bottom right of every page. A person opens their one chat with ผู้ดูแลระบบ;
 * ผู้ดูแลระบบ open the shared inbox and up to three chats at once. Nothing here closes on Esc or an outside click.
 */
export function SupportChat({ admin, images, unread: initialUnread }: { admin: boolean; images: boolean; unread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState<{ id: string; title: string; alert: number }[]>([]);
  const [inbox, setInbox] = useState<SupportConversationSummary[] | null>(null);
  const [live, setLive] = useState(false);
  // Bumped whenever the stream says the chat changed (open windows reload) or a new message reached us (windows unfold).
  const [refreshKey, setRefreshKey] = useState(0);
  const [alertKey, setAlertKey] = useState(0);
  const unreadRef = useRef(initialUnread);
  const lastSeen = useRef<string | null | undefined>(undefined);

  const refreshCount = useCallback(async () => {
    try {
      const response = await fetch('/api/support-chat/summary', { cache: 'no-store' });
      if (response.ok) setUnread(((await response.json()) as { unread: number }).unread);
    } catch { /* the count stays as it was */ }
  }, []);

  const loadInbox = useCallback(async (): Promise<SupportConversationSummary[] | null> => {
    try {
      const response = await fetch('/api/support-chat/conversations', { cache: 'no-store' });
      if (!response.ok) return null;
      const conversations = ((await response.json()) as { conversations: SupportConversationSummary[] }).conversations;
      setInbox(conversations);
      return conversations;
    } catch { return null; /* keep the last list */ }
  }, []);

  const openChat = useCallback((item: Pick<SupportConversationSummary, 'id' | 'displayName'>, alert = false) => {
    setChats((current) => current.some((chat) => chat.id === item.id)
      ? current.map((chat) => chat.id === item.id && alert ? { ...chat, alert: chat.alert + 1 } : chat)
      : [...current, { id: item.id, title: item.displayName ?? '—', alert: 0 }].slice(-MAX_OPEN_CHATS));
  }, []);

  // Live: one Server-Sent Events connection per page. Polling below stays as the fallback while it is not connected.
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/support-chat/stream');
    source.addEventListener('open', () => setLive(true));
    source.addEventListener('error', () => setLive(false));
    source.addEventListener('chat', (event) => {
      let state: { unread: number; lastMessageAt: string | null; conversationId: string | null };
      try { state = JSON.parse((event as MessageEvent<string>).data); } catch { return; }
      setLive(true);
      const first = lastSeen.current === undefined;
      const changed = !first && state.lastMessageAt !== lastSeen.current;
      const arrived = !first && state.unread > unreadRef.current;
      lastSeen.current = state.lastMessageAt;
      unreadRef.current = state.unread;
      setUnread(state.unread);
      if (changed) setRefreshKey((key) => key + 1);
      if (!arrived) return;
      alertNewMessage();
      if (!admin) { setOpen(true); setAlertKey((key) => key + 1); return; }
      const waiting = state.conversationId;
      if (waiting) void loadInbox().then((conversations) => { const item = conversations?.find((row) => row.id === waiting); if (item) openChat(item, true); });
    });
    return () => source.close();
  }, [admin, loadInbox, openChat]);

  useEffect(() => { unreadRef.current = unread; }, [unread]);

  useEffect(() => {
    if (live) return;
    const timer = setInterval(() => { if (!document.hidden) void refreshCount(); }, SUMMARY_POLL_MS);
    return () => clearInterval(timer);
  }, [live, refreshCount]);

  useEffect(() => { if (admin && open && refreshKey > 0) void loadInbox(); }, [admin, open, refreshKey, loadInbox]);

  useEffect(() => {
    if (!admin || !open) return;
    void loadInbox();
    if (live) return;
    const timer = setInterval(() => { if (!document.hidden) void loadInbox(); }, INBOX_POLL_MS);
    return () => clearInterval(timer);
  }, [admin, open, live, loadInbox]);

  const onRead = useCallback(() => { void refreshCount(); if (admin) void loadInbox(); }, [admin, refreshCount, loadInbox]);

  const label = `${t('supportChatButton')}${unread > 0 ? ` ${unread} ${t('supportChatUnreadSuffix')}` : ''}`;
  return <div className="support-chat">
    <div className="chat-dock">
      {admin && open ? <section className="chat-window chat-inbox" role="region" aria-labelledby="chat-inbox-title">
        <header className="chat-window-head">
          <h2 className="chat-window-title" id="chat-inbox-title">{t('supportChatInboxTitle')}</h2>
          <button type="button" className="chat-icon-button" aria-label={t('supportChatCloseInbox')} onClick={() => setOpen(false)}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></button>
        </header>
        <ul className="chat-inbox-list">
          {inbox && inbox.length === 0 ? <li className="chat-empty">{t('supportChatInboxEmpty')}</li> : null}
          {(inbox ?? []).map((item) => <li key={item.id}>
            <button type="button" className={`chat-inbox-row${item.unread > 0 ? ' is-unread' : ''}`} onClick={() => openChat(item)}>
              <span className="chat-inbox-name">{item.displayName ?? '—'}</span>
              {item.positionTitle ? <span className="chat-inbox-position">{item.positionTitle}</span> : null}
              <span className="chat-inbox-last">{item.lastMessage ?? (item.lastHasImage ? t('supportChatImage') : '')}</span>
              <time dateTime={item.lastMessageAt}>{formatBangkokDateTime(item.lastMessageAt)}</time>
              {item.unread > 0 ? <span className="chat-count">{item.unread}</span> : null}
            </button>
          </li>)}
        </ul>
      </section> : null}
      {admin
        ? chats.map((chat) => <SupportChatWindow key={chat.id} title={chat.title} endpoints={conversation(chat.id)} images={images} live={live} refreshKey={refreshKey} alertKey={chat.alert} onRead={onRead} onClose={() => setChats((current) => current.filter((item) => item.id !== chat.id))} />)
        : open ? <SupportChatWindow title={t('supportChatAdminTitle')} endpoints={mine} images={images} live={live} refreshKey={refreshKey} alertKey={alertKey} onRead={onRead} onClose={() => setOpen(false)} /> : null}
    </div>
    <button type="button" className={`chat-launcher${unread > 0 ? ' has-unread' : ''}`} aria-label={label} aria-expanded={open} onClick={() => setOpen((value) => admin ? !value : true)}>
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5" strokeLinecap="round"/></svg>
      {unread > 0 ? <span className="chat-count" aria-hidden="true">{unread}</span> : null}
    </button>
  </div>;
}

let titleBeforeAlert: string | null = null;
let alertsWhileHidden = 0;

/** A short chime (where the browser allows sound) and, while the tab is in the background, "(n) ข้อความใหม่" in its title. */
function alertNewMessage(): void {
  chime();
  if (typeof document === 'undefined' || !document.hidden) return;
  if (titleBeforeAlert === null) {
    titleBeforeAlert = document.title;
    const restore = () => {
      if (document.hidden) return;
      if (titleBeforeAlert !== null) document.title = titleBeforeAlert;
      titleBeforeAlert = null;
      alertsWhileHidden = 0;
      document.removeEventListener('visibilitychange', restore);
    };
    document.addEventListener('visibilitychange', restore);
  }
  alertsWhileHidden += 1;
  document.title = `(${alertsWhileHidden}) ${t('supportChatNewMessage')} · ${titleBeforeAlert}`;
}

function chime(): void {
  try {
    const Context = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Context) return;
    const audio = new Context();
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(880, audio.currentTime);
    tone.frequency.setValueAtTime(660, audio.currentTime + 0.12);
    volume.gain.setValueAtTime(0.0001, audio.currentTime);
    volume.gain.exponentialRampToValueAtTime(0.15, audio.currentTime + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.3);
    tone.connect(volume).connect(audio.destination);
    tone.start();
    tone.stop(audio.currentTime + 0.32);
    tone.onended = () => void audio.close();
  } catch { /* no sound is fine */ }
}
