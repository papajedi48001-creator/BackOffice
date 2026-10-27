import { createServer, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ClamdScanner } from './clamd-scanner';

const pdf = { actorPersonId: 'person-a', filename: 'ใบรับรองแพทย์.pdf', contentType: 'application/pdf' as const, bytes: new TextEncoder().encode('%PDF-1.7 hello') };
let server: Server | undefined;

/** A fake clamd: collects the INSTREAM chunks, then answers with `reply` (or never, when it is null). */
async function fakeClamd(reply: string | null): Promise<{ port: number; received: () => Buffer }> {
  let data = Buffer.alloc(0);
  server = createServer((socket: Socket) => {
    socket.on('data', (chunk) => {
      data = Buffer.concat([data, chunk]);
      if (reply !== null && data.length >= 4 && data.subarray(-4).equals(Buffer.from([0, 0, 0, 0]))) socket.end(`${reply}\0`);
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return { port: typeof address === 'object' && address ? address.port : 0, received: () => data };
}

afterEach(async () => { await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())); server = undefined; });

describe('ClamdScanner', () => {
  it('streams the bytes with INSTREAM and reads OK as clean', async () => {
    const clamd = await fakeClamd('stream: OK');
    expect(await new ClamdScanner({ host: '127.0.0.1', port: clamd.port }).scan(pdf)).toBe('CLEAN');
    const received = clamd.received();
    expect(received.subarray(0, 10).toString()).toBe('zINSTREAM\0');
    expect(received.readUInt32BE(10)).toBe(pdf.bytes.byteLength);
    expect(received.subarray(14, 14 + pdf.bytes.byteLength).toString()).toBe('%PDF-1.7 hello');
  });

  it('reads a FOUND reply as infected', async () => {
    const clamd = await fakeClamd('stream: Eicar-Test-Signature FOUND');
    expect(await new ClamdScanner({ host: '127.0.0.1', port: clamd.port }).scan(pdf)).toBe('INFECTED');
  });

  it('fails closed when clamd never answers', async () => {
    const clamd = await fakeClamd(null);
    expect(await new ClamdScanner({ host: '127.0.0.1', port: clamd.port, timeoutMs: 200 }).scan(pdf)).toBe('UNAVAILABLE');
  });

  it('fails closed when nothing listens', async () => {
    expect(await new ClamdScanner({ host: '127.0.0.1', port: 1, timeoutMs: 500 }).scan(pdf)).toBe('UNAVAILABLE');
  });

  it('fails closed on an error reply', async () => {
    const clamd = await fakeClamd('INSTREAM size limit exceeded. ERROR');
    expect(await new ClamdScanner({ host: '127.0.0.1', port: clamd.port }).scan(pdf)).toBe('UNAVAILABLE');
  });
});
