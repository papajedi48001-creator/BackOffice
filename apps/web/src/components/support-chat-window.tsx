'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SUPPORT_MESSAGE_MAX_LENGTH, type SupportMessage } from '@backoffice/contracts';
import { t } from '@backoffice/i18n';
import { formatBangkokDateTime } from '../lib/bangkok-time';

/** Where one chat window reads, sends and marks read: the person's own chat or, for ผู้ดูแลระบบ, one conversation. */
export interface ChatEndpoints { load: string; send: string; read: string; }

// Fallback while the live stream is down; with it, the window reloads on each stream change instead.
const POLL_MS = 15_000;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function imageError(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return t('supportChatErrorImageType');
  if (file.size > MAX_IMAGE_BYTES) return t('supportChatErrorTooLarge');
  return null;
}

/**
 * One docked chat window (not a modal): it closes or folds only from its own × and – buttons, never on Esc or a click
 * elsewhere. While unfolded it reloads whenever the live stream says the chat changed (`refreshKey`), or every 15 seconds
 * while the stream is down, and marks what it shows read. A new message for us (`alertKey`) unfolds it.
 */
export function SupportChatWindow({ title, endpoints, images, live = false, refreshKey = 0, alertKey = 0, onClose, onRead }: { title: string; endpoints: ChatEndpoints; images: boolean; live?: boolean; refreshKey?: number; alertKey?: number; onClose(): void; onRead?(): void }) {
  const [messages, setMessages] = useState<SupportMessage[] | null>(null);
  const [folded, setFolded] = useState(false);
  const [text, setText] = useState('');
  const [image, setImage] = useState<{ file: File; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const lastRead = useRef<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(endpoints.load, { cache: 'no-store' });
      if (!response.ok) { setError(t('supportChatErrorLoad')); return; }
      const loaded = ((await response.json()) as { messages?: SupportMessage[] }).messages ?? [];
      setMessages(loaded);
      const newest = loaded.at(-1)?.id ?? '';
      if (lastRead.current !== newest) {
        lastRead.current = newest;
        await fetch(endpoints.read, { method: 'POST' });
        onRead?.();
      }
    } catch { setError(t('supportChatErrorLoad')); }
  }, [endpoints.load, endpoints.read, onRead]);

  useEffect(() => {
    if (folded) return;
    void load();
  }, [folded, load, refreshKey]);

  useEffect(() => {
    if (folded || live) return;
    // A hidden tab skips its turn; the next visible one catches up.
    const timer = setInterval(() => { if (!document.hidden) void load(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [folded, live, load]);

  useEffect(() => { if (alertKey > 0) setFolded(false); }, [alertKey]);

  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [messages?.length]);
  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url); }, [image]);

  function pick(file: File) {
    if (!images) { setError(t('supportChatErrorNoFiles')); return; }
    const problem = imageError(file);
    if (problem) { setError(problem); return; }
    setError(null);
    setImage({ file, url: URL.createObjectURL(file) });
  }

  function onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(event.clipboardData?.items ?? []).find((entry) => entry.kind === 'file' && entry.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (!file) return;
    event.preventDefault();
    pick(file);
  }

  async function send() {
    const body = text.trim();
    if (sending || (!body && !image)) return;
    if (body.length > SUPPORT_MESSAGE_MAX_LENGTH) { setError(t('supportChatErrorTooLong')); return; }
    setSending(true);
    setError(null);
    try {
      let attachmentId: string | undefined;
      if (image) {
        const form = new FormData();
        form.append('file', image.file, image.file.name || 'image.png');
        const uploaded = await fetch('/api/support-chat/images', { method: 'POST', body: form });
        if (!uploaded.ok) { setError(uploaded.status === 503 ? t('supportChatErrorNoFiles') : uploaded.status === 413 ? t('supportChatErrorTooLarge') : uploaded.status === 415 ? t('supportChatErrorImageType') : t('supportChatErrorSend')); return; }
        attachmentId = ((await uploaded.json()) as { attachmentId: string }).attachmentId;
      }
      const response = await fetch(endpoints.send, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...(body ? { body } : {}), ...(attachmentId ? { attachmentId } : {}) }) });
      if (!response.ok) { setError(t('supportChatErrorSend')); return; }
      setText('');
      setImage(null);
      await load();
    } catch { setError(t('supportChatErrorSend')); } finally { setSending(false); }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
  }

  const titleId = `chat-title-${endpoints.load.replace(/[^a-z0-9]/gi, '-')}`;
  return <section className={`chat-window${folded ? ' is-folded' : ''}`} role="region" aria-labelledby={titleId}>
    <header className="chat-window-head">
      <button type="button" className="chat-window-title" id={titleId} onClick={() => setFolded((value) => !value)} aria-expanded={!folded} title={folded ? t('supportChatExpand') : t('supportChatMinimize')}>{title}</button>
      <button type="button" className="chat-icon-button" aria-label={folded ? t('supportChatExpand') : t('supportChatMinimize')} onClick={() => setFolded((value) => !value)}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></button>
      <button type="button" className="chat-icon-button" aria-label={t('supportChatClose')} onClick={onClose}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></button>
    </header>
    {folded ? null : <>
      <ol className="chat-messages" ref={list} aria-live="polite">
        {messages && messages.length === 0 ? <li className="chat-empty">{t('supportChatEmpty')}</li> : null}
        {(messages ?? []).map((message) => <li key={message.id} className={`chat-message${message.mine ? ' is-mine' : ''}`}>
          {!message.mine || message.fromAdmin ? <span className="chat-sender">{message.senderName ?? t('supportChatAdminTitle')}</span> : null}
          <div className="chat-bubble">
            {message.attachmentId ? <a href={`/api/support-chat/images/${message.attachmentId}`} target="_blank" rel="noreferrer" aria-label={t('supportChatOpenImage')}><img src={`/api/support-chat/images/${message.attachmentId}`} alt={t('supportChatImage')} loading="lazy" /></a> : null}
            {message.body ? <p>{message.body}</p> : null}
          </div>
          <time dateTime={message.createdAt}>{formatBangkokDateTime(message.createdAt)}</time>
        </li>)}
      </ol>
      {error ? <p className="chat-error" role="alert">{error}</p> : null}
      {image ? <div className="chat-preview"><img src={image.url} alt={t('supportChatPreview')} /><button type="button" className="chat-icon-button" aria-label={t('supportChatRemoveImage')} onClick={() => setImage(null)}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></button></div> : null}
      <div className="chat-composer">
        {images ? <>
          <button type="button" className="chat-icon-button" aria-label={t('supportChatAttach')} onClick={() => fileInput.current?.click()}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg></button>
          <input ref={fileInput} type="file" accept={IMAGE_TYPES.join(',')} hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) pick(file); event.target.value = ''; }} />
        </> : null}
        <textarea aria-label={t('supportChatMessage')} placeholder={t('supportChatPlaceholder')} rows={1} maxLength={SUPPORT_MESSAGE_MAX_LENGTH} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={onKeyDown} onPaste={onPaste} />
        <button type="button" className="chat-send" onClick={() => void send()} disabled={sending || (!text.trim() && !image)} aria-label={t('supportChatSend')}>{sending ? t('supportChatSending') : t('supportChatSend')}</button>
      </div>
    </>}
  </section>;
}
