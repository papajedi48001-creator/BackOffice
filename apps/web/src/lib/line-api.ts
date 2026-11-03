import { readRuntimeValue } from './runtime-env';

const API = 'https://api.line.me/v2/bot';

/** การแจ้งเตือน LINE settings from the server environment. Values never leave the server. */
export function lineSettings(): { accessToken: string | undefined; channelSecret: string | undefined; basicId: string | undefined } {
  return { accessToken: readRuntimeValue('LINE_CHANNEL_ACCESS_TOKEN'), channelSecret: readRuntimeValue('LINE_CHANNEL_SECRET'), basicId: readRuntimeValue('LINE_BOT_BASIC_ID') };
}

/** The bot's add-friend page; the basic id (`@123abcd`) is public. */
export function addFriendUrl(basicId: string | undefined): string | null {
  return basicId ? `https://line.me/R/ti/p/${encodeURIComponent(basicId)}` : null;
}

async function call(accessToken: string, path: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<Response | null> {
  try {
    return await fetch(`${API}${path}`, { method: init.method, headers: { Authorization: `Bearer ${accessToken}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) }, ...(init.body ? { body: JSON.stringify(init.body) } : {}), signal: AbortSignal.timeout(10_000) });
  } catch {
    return null;
  }
}

/** Answers a webhook message (free of quota). A failure is ignored: the person can simply send the code again. */
export async function replyLineText(accessToken: string, replyToken: string, text: string): Promise<void> {
  await call(accessToken, '/message/reply', { method: 'POST', body: { replyToken, messages: [{ type: 'text', text }] } });
}

/** The group's name as LINE shows it, or null. */
export async function lineGroupName(accessToken: string, groupId: string): Promise<string | null> {
  const response = await call(accessToken, `/group/${groupId}/summary`, { method: 'GET' });
  if (!response?.ok) return null;
  const body = await response.json().catch(() => null) as { groupName?: unknown } | null;
  return typeof body?.groupName === 'string' && body.groupName.trim() ? body.groupName.trim() : null;
}

/** ส่งข้อความทดสอบ: true when LINE accepted it. */
export async function pushLineText(accessToken: string, to: string, text: string): Promise<boolean> {
  const response = await call(accessToken, '/message/push', { method: 'POST', body: { to, messages: [{ type: 'text', text }] } });
  return Boolean(response?.ok);
}
