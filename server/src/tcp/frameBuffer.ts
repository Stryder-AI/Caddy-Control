/**
 * Splits an incoming TCP stream into complete iStartek frames.
 *
 * The iStartek protocol terminates every frame with \r\n. TCP does not
 * preserve message boundaries, so we buffer and emit whole lines only.
 *
 * Usage:
 *   const fb = new FrameBuffer();
 *   socket.on('data', chunk => {
 *     for (const frame of fb.push(chunk)) {
 *       // frame is a complete line without the trailing CRLF
 *     }
 *   });
 *
 * A hard cap protects against a misbehaving client that never sends CRLF.
 */
const MAX_FRAME_BYTES = 4096;

export class FrameBuffer {
  private buf = Buffer.alloc(0);

  push(chunk: Buffer): string[] {
    this.buf = Buffer.concat([this.buf, chunk]);
    const out: string[] = [];
    while (true) {
      const idx = this.buf.indexOf('\r\n');
      if (idx === -1) {
        if (this.buf.length > MAX_FRAME_BYTES) this.buf = Buffer.alloc(0);
        break;
      }
      const line = this.buf.subarray(0, idx).toString('ascii');
      this.buf = this.buf.subarray(idx + 2);
      if (line.length > 0) out.push(line);
    }
    return out;
  }

  clear(): void {
    this.buf = Buffer.alloc(0);
  }
}
