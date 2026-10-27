import { connect } from 'node:net';
import type { UploadAttachmentInput } from '@backoffice/contracts';
import type { MalwareScanner, ScanStatus } from './scan-service';

const CHUNK_BYTES = 64 * 1024;

/** Scans with clamd's INSTREAM over TCP. Anything but a clear OK or FOUND answer, including no answer in time, is UNAVAILABLE so the upload fails closed. */
export class ClamdScanner implements MalwareScanner {
  constructor(private readonly options: { host: string; port: number; timeoutMs?: number }) {}

  scan(input: Pick<UploadAttachmentInput, 'bytes'>): Promise<ScanStatus> {
    return new Promise((resolve) => {
      let reply = '';
      let settled = false;
      const finish = (status: ScanStatus) => { if (settled) return; settled = true; socket.destroy(); resolve(status); };
      const socket = connect({ host: this.options.host, port: this.options.port });
      socket.setTimeout(this.options.timeoutMs ?? 10_000, () => finish('UNAVAILABLE'));
      socket.on('error', () => finish('UNAVAILABLE'));
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let offset = 0; offset < input.bytes.byteLength; offset += CHUNK_BYTES) {
          const chunk = input.bytes.subarray(offset, offset + CHUNK_BYTES);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(chunk.byteLength);
          socket.write(size);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
      socket.on('data', (data) => {
        reply += data.toString('utf8');
        if (reply.includes('\0')) finish(statusOf(reply));
      });
      socket.on('end', () => finish(statusOf(reply)));
    });
  }
}

function statusOf(reply: string): ScanStatus {
  const text = reply.replace(/\0/g, '').trim();
  if (/^stream: OK$/.test(text)) return 'CLEAN';
  if (/ FOUND$/.test(text)) return 'INFECTED';
  return 'UNAVAILABLE';
}
