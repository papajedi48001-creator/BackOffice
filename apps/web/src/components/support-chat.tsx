'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupportConversationSummary } from '@backoffice/contracts';
import { t } from '@backoffice/i18n';
import { formatBangkokDateTime } from '../lib/bangkok-time';
import { SupportChatWindow, type ChatEndpoints } from './support-chat-window';

const SUMMARY_POLL_MS = 30_000;
const INBOX_POLL_MS = 10_000;
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
  const [chats, setChats] = useState<{ id: string; title: string }[]>([]);
  const [inbox, setInbox] = useState<SupportConversationSummary[] | null>(null);

  const refreshCount = useCallback(async () => {
    try {
      const response = await fetch('/api/support-chat/summary', { cache: 'no-store' });
      if (response.ok) setUnread(((await response.json()) as { unread: number }).unread);
    } catch { /* the count stays as it was */ }
  }, []);

  const loadInbox = useCallback(async () => {
    try {
      const response = await fetch('/api/support-chat/conversations', { cache: 'no-store' });
      if (response.ok) setInbox(((await response.json()) as { conversations: SupportConversationSummary[] }).conversations);
    } catch { /* keep the last list */ }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) void refreshCount(); }, SUMMARY_POLL_MS);
    return () => clearInterval(timer);
  }, [refreshCount]);

  useEffect(() => {
    if (!admin || !open) return;
    void loadInbox();
    const timer = setInterval(() => { if (!document.hidden) void loadInbox(); }, INBOX_POLL_MS);
    return () => clearInterval(timer);
  }, [admin, open, loadInbox]);

  const onRead = useCallback(() => { void refreshCount(); if (admin) void loadInbox(); }, [admin, refreshCount, loadInbox]);

  function openChat(item: SupportConversationSummary) {
    setChats((current) => current.some((chat) => chat.id === item.id) ? current : [...current, { id: item.id, title: item.displayName ?? '—' }].slice(-MAX_OPEN_CHATS));
  }

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
        ? chats.map((chat) => <SupportChatWindow key={chat.id} title={chat.title} endpoints={conversation(chat.id)} images={images} onRead={onRead} onClose={() => setChats((current) => current.filter((item) => item.id !== chat.id))} />)
        : open ? <SupportChatWindow title={t('supportChatAdminTitle')} endpoints={mine} images={images} onRead={onRead} onClose={() => setOpen(false)} /> : null}
    </div>
    <button type="button" className="chat-launcher" aria-label={label} aria-expanded={open} onClick={() => setOpen((value) => admin ? !value : true)}>
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5" strokeLinecap="round"/></svg>
      {unread > 0 ? <span className="chat-count" aria-hidden="true">{unread}</span> : null}
    </button>
  </div>;
}
