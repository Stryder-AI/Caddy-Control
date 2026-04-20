import { describe, it, expect } from 'vitest';
import { checksum, verifyChecksum } from '../src/tcp/checksum.js';
import { decodeEvent, encodeCommand, encodeAck } from '../src/tcp/iStartekCodec.js';
import { FrameBuffer } from '../src/tcp/frameBuffer.js';

describe('checksum', () => {
  // Canonical example from iStartek protocol V1.6 §2:
  // "&&A20,021104023195429,800" sum = 0x04DA, low byte = 0xDA
  it('matches the doc canonical example', () => {
    expect(checksum('&&A20,021104023195429,800')).toBe('DA');
  });

  it('byte-sum (not XOR)', () => {
    // A = 0x41, B = 0x42; byte-sum mod 256 = 0x83
    expect(checksum('AB')).toBe('83');
  });

  it('verifyChecksum succeeds when the last 2 chars are the correct cs', () => {
    expect(verifyChecksum('&&A20,021104023195429,800DA')).toBe(true);
  });
  it('verifyChecksum fails on wrong cs', () => {
    expect(verifyChecksum('&&A20,021104023195429,800FF')).toBe(false);
  });
});

describe('decodeEvent', () => {
  it('decodes the doc example event frame', () => {
    // V1.6 example (§3):
    //  &&A147,021104023195429,000,0,,180106093046,A,22.646430,114.065730,8,0.9,54,86,76,326781,460|0|27B3|0EA7,27,0000000F,02,01,04E2|018C|01C8|0000,1,0104B0,01013D|028135 <cs>
    // We compute the checksum here so the test is stable regardless of byte counting nuance.
    const body =
      'A147,021104023195429,000,0,,180106093046,A,22.646430,114.065730,8,0.9,54,86,76,326781,460|0|27B3|0EA7,27,0000000F,02,01,04E2|018C|01C8|0000,1,0104B0,01013D|028135';
    const cs = checksum('&&' + body);
    const frame = '&&' + body + cs;
    const r = decodeEvent(frame);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.event.deviceId).toBe('021104023195429');
    expect(r.event.cmd).toBe('000');
    expect(r.event.almCode).toBe(0);
    expect(r.event.fixFlag).toBe('A');
    expect(r.event.lat).toBeCloseTo(22.646430, 5);
    expect(r.event.lng).toBeCloseTo(114.065730, 5);
    expect(r.event.satellites).toBe(8);
    expect(r.event.speedKph).toBe(54);
    expect(r.event.course).toBe(86);
    expect(r.event.odometerMeters).toBe(326781);
    expect(r.event.extV).toBeCloseTo(12.5, 2);
    expect(r.event.batV).toBeCloseTo(3.96, 2);
    expect(r.event.inSta).toBe(0x02);
    expect(r.event.outSta).toBe(0x01);
  });

  it('rejects a frame with a bad checksum', () => {
    const r = decodeEvent('&&A10,021104023195429,000FF');
    expect(r.ok).toBe(false);
  });

  it('parses an Enter Fence event (alm-code 26)', () => {
    const body =
      'B100,123456789012345,000,26,1,240101120000,A,33.444406,72.862765,9,0.8,5.2,90,85,12345,410|1|0000|0000,28,0000000C,00,01,12C0|0190|0000|0000,1,,';
    const cs = checksum('&&' + body);
    const r = decodeEvent('&&' + body + cs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.event.almCode).toBe(26);
    expect(r.event.almData).toBe('1');
    // output1 should be active (bit0 of outSta=01)
    expect(r.event.outSta & 0x01).toBe(1);
  });
});

describe('encodeCommand', () => {
  it('round-trips: encodeCommand output decodes the payload correctly', () => {
    const frame = encodeCommand({
      deviceId: '021104023195429',
      cmdCode: '900',
      cmdData: '1,0,15000,0',
    }).toString('ascii');
    expect(frame.endsWith('\r\n')).toBe(true);
    expect(frame.startsWith('$$')).toBe(true);
    // Verify self-checksum
    expect(verifyChecksum(frame.slice(0, -2))).toBe(true);
  });

  it('encodeAck echoes the device pack-no for 010 events', () => {
    const body =
      'X40,864000000000001,010,0,,240101120000,A,33.4,72.8,8,0.9,0,0,0,0,410|1|0000|0000,20,00000004,00,00,12C0|0190|0000|0000,1,,';
    const cs = checksum('&&' + body);
    const ev = decodeEvent('&&' + body + cs);
    expect(ev.ok).toBe(true);
    if (!ev.ok) return;
    const ack = encodeAck(ev.event);
    expect(ack).not.toBeNull();
    const s = ack!.toString('ascii');
    // pack-no char 'X' echoed back as first char after $$
    expect(s[2]).toBe('X');
  });
});

describe('FrameBuffer', () => {
  it('splits a stream on CRLF and emits complete frames', () => {
    const fb = new FrameBuffer();
    const part1 = Buffer.from('&&A10,X,000,');
    const part2 = Buffer.from('0,\r\n&&B10,Y,000,0,\r\nextra');
    const out1 = fb.push(part1);
    expect(out1).toHaveLength(0);
    const out2 = fb.push(part2);
    expect(out2).toHaveLength(2);
    expect(out2[0]).toBe('&&A10,X,000,0,');
    expect(out2[1]).toBe('&&B10,Y,000,0,');
  });
});
