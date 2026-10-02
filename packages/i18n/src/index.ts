import { th, type MessageKey } from './th';

export { th, type MessageKey };
export function t(key: MessageKey): string { return th[key]; }
