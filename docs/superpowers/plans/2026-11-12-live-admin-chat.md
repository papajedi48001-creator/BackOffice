# Live แชตกับผู้ดูแลระบบ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Chat count, open windows and alerts update the moment a message is sent, without a refresh.
**Architecture:** `SupportChatService.liveState` → `chatEventStream` (SSE, in-process wake-up + 2 s check) → `useChatLive` in `SupportChat` driving count, reloads and alerts.
**Spec:** `docs/superpowers/specs/2026-11-12-live-admin-chat-design.md`

## Review Focus
- Stream never carries message text. - A refused send wakes nobody. - Lost connection falls back to polling. - Auto-open respects 3 windows. - Reduced motion stops the pulse.

### Task 1: liveState + stream (server)
- [x] Integration test `reports the live state the stream watches` (core) → implement `liveState(subject): Promise<SupportChatLiveState>`.
- [x] `lib/chat-stream.test.ts`: first state at once with `retry: 3000`, only changes after, `notifyChatChanged` wakes at once, ping + end at maxMs, failed check retried → implement `chatEventStream(read, timing, signal)`, `notifyChatChanged()`.
- [x] route tests: stream 401/headers/first event; send + read routes notify only on success → implement `stream/route.ts` and notify calls.
- [x] Caddyfile: no `encode` for `/api/support-chat/stream`. Commit `feat(chat): live chat stream`.

### Task 2: live client + alerts
- [x] `support-chat.test.tsx`: a stream event raises the count without polling; person window opens itself on a new admin reply; admin window for the waiting conversation opens itself; tab title shows "(1) ข้อความใหม่"; an open window reloads on a stream event.
- [x] Implement in `support-chat.tsx` / `support-chat-window.tsx` (`refreshKey` prop), CSS pulse, i18n. Commit `feat(chat): open and alert on new messages live`.

### Task 3: Verify
- [ ] `pnpm lint && pnpm typecheck && pnpm test`, integration with MariaDB, real two-browser check that a reply appears without refresh.
