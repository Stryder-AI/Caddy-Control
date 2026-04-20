/**
 * iStartek VT-100 / VT-200 / PT60 ASCII framed protocol codec.
 *
 * Uplink frame (tracker -> server):
 *   &&<pack-no><pack-len>,<ID>,<cmd>,<alm-code>,<alm-data>,<date-time>,<fix_flag>,
 *   <lat>,<lng>,<sat>,<HDOP>,<speed>,<course>,<alt>,<odometer>,
 *   <MCC|MNC|LAC|CI>,<CSQ>,<system-sta>,<in-sta>,<out-sta>,
 *   <ext-V|bat-V|ad1-V|...>,<pro-code>,<fuel>,<temp><checksum>\r\n
 *
 * Downlink frame (server -> tracker):
 *   $$<pack-no><pack-len>,<ID>,<cmd-code>,<cmd-data><checksum>\r\n
 *
 * pack-no is a single byte 0x3A..0x7E (':' .. '~') cycling continuously; when
 * we reply to a tracker message that required an ack, we echo its pack-no.
 *
 * pack-len is a decimal string, equal to the byte length of:
 *   ",<ID>,<cmd>,<cmd-data>"  (commands, outbound)
 *   the equivalent CSV body for events (inbound)
 *
 * The tracker uses pack-len to frame the body; we compute it for downlink.
 */

import { checksum, verifyChecksum } from './checksum.js';

// ---------- Types ----------

export type CmdType = '000' | '010' | '020';

export interface EventPacket {
  /** Raw single-byte pack-no, as the character the device sent. */
  packNo: string;
  packLen: number;
  deviceId: string;
  cmd: CmdType; // 000=no ack, 010=needs ack, 020=compressed+ack
  almCode: number;
  almData: string;
  /** Parsed UTC timestamp, ms. Null if device GPS not valid. */
  timestamp: number | null;
  /** 'A' valid, 'V' invalid */
  fixFlag: 'A' | 'V';
  lat: number;
  lng: number;
  satellites: number;
  hdop: number;
  /** km/h */
  speedKph: number;
  /** heading degrees 0..359 */
  course: number;
  /** meters */
  altitude: number;
  /** on-device accumulated total mileage, in meters */
  odometerMeters: number;
  mcc: number;
  mnc: number;
  lac: number;
  ci: number;
  csq: number;
  /** 32-bit status word (hex in packet). bit2=GPS valid, bit3=ext-power connected, bit5=stopped, ... */
  systemSta: number;
  /** digital inputs bitmask */
  inSta: number;
  /** digital outputs bitmask — bit0 = output1 (our relay pin) */
  outSta: number;
  /** External power supply volts (V). NaN if absent. */
  extV: number;
  /** Internal backup battery volts (V). NaN if absent. */
  batV: number;
  /** Raw frame text between && and the checksum, for debugging. */
  raw: string;
}

export interface DecodeResult {
  ok: true;
  event: EventPacket;
}
export interface DecodeError {
  ok: false;
  reason: string;
  raw: string;
}

// ---------- Downlink pack-no ring ----------

let downlinkPackNo = 0x3a;
export function nextPackNo(): string {
  const ch = String.fromCharCode(downlinkPackNo);
  downlinkPackNo = downlinkPackNo + 1;
  if (downlinkPackNo > 0x7e) downlinkPackNo = 0x3a;
  return ch;
}

// ---------- Helpers ----------

function toInt(s: string | undefined, fallback = 0): number {
  if (!s) return fallback;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
}
function toFloat(s: string | undefined, fallback = 0): number {
  if (!s) return fallback;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
}
function toHexInt(s: string | undefined, fallback = 0): number {
  if (!s) return fallback;
  const n = parseInt(s, 16);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Parse YYMMDDHHmmss (GMT) into ms.
 * Doc §3: "date-time: GMT0 date & time, format: YYMMDDHHmmss"
 */
function parseGmtDateTime(s: string | undefined): number | null {
  if (!s || s.length !== 12) return null;
  const yy = parseInt(s.slice(0, 2), 10);
  const mm = parseInt(s.slice(2, 4), 10);
  const dd = parseInt(s.slice(4, 6), 10);
  const hh = parseInt(s.slice(6, 8), 10);
  const mi = parseInt(s.slice(8, 10), 10);
  const ss = parseInt(s.slice(10, 12), 10);
  if (![yy, mm, dd, hh, mi, ss].every(Number.isFinite)) return null;
  return Date.UTC(2000 + yy, mm - 1, dd, hh, mi, ss);
}

/**
 * Voltage strings in packet are "V*100" in hex, 4 chars each, pipe-separated.
 * e.g. "04E2|018C|01C8|0000" means:
 *   ext-V = 0x04E2 / 100 = 12.50 V
 *   bat-V = 0x018C / 100 = 3.96 V
 *   ad1   = 0x01C8 / 100 = 4.56 V
 *   ad2   = 0
 */
function parseVoltages(s: string | undefined): { extV: number; batV: number } {
  if (!s) return { extV: NaN, batV: NaN };
  const parts = s.split('|');
  const extV = parts[0] ? parseInt(parts[0], 16) / 100 : NaN;
  const batV = parts[1] ? parseInt(parts[1], 16) / 100 : NaN;
  return { extV, batV };
}

/**
 * Parse the MCC|MNC|LAC|CI group. MCC and MNC are decimal; LAC and CI are hex.
 * e.g. "460|0|27B3|0EA7"
 */
function parseCellInfo(s: string | undefined): {
  mcc: number;
  mnc: number;
  lac: number;
  ci: number;
} {
  if (!s) return { mcc: 0, mnc: 0, lac: 0, ci: 0 };
  const parts = s.split('|');
  return {
    mcc: toInt(parts[0]),
    mnc: toInt(parts[1]),
    lac: toHexInt(parts[2]),
    ci: toHexInt(parts[3]),
  };
}

// ---------- Decode ----------

/**
 * Decode one complete iStartek event frame (one line, excluding \r\n).
 * The caller must have already stripped CRLF and the leading '&&' sentinel.
 *
 * Frame shape after '&&':
 *   <pack-no char><pack-len decimal>,<ID>,<cmd>,<alm-code>,<alm-data>,<date-time>,
 *   <fix_flag>,<lat>,<lng>,<sat>,<HDOP>,<speed>,<course>,<alt>,<odometer>,
 *   <MCC|MNC|LAC|CI>,<CSQ>,<system-sta-hex8>,<in-sta-hex2>,<out-sta-hex2>,
 *   <V1|V2|..>,<pro-code>,<fuel>,<temp><checksum2>
 *
 * pack-no + pack-len run together (pack-no is exactly one character, pack-len is
 * decimal digits up to the first comma).
 */
export function decodeEvent(frameWithoutCrlf: string): DecodeResult | DecodeError {
  const raw = frameWithoutCrlf;
  if (!raw.startsWith('&&')) {
    return { ok: false, reason: 'missing && header', raw };
  }
  const inner = raw.slice(2);
  if (inner.length < 4) {
    return { ok: false, reason: 'too short', raw };
  }

  // Split trailing 2-char checksum.
  const bodyWithCs = inner;
  if (!verifyChecksum('&&' + bodyWithCs)) {
    return { ok: false, reason: 'checksum mismatch', raw };
  }
  const body = bodyWithCs.slice(0, -2);

  // packNo is the first character, packLen is decimal digits up to the first comma.
  const packNo = body.charAt(0);
  let i = 1;
  while (i < body.length && body[i] !== ',' && /\d/.test(body[i]!)) i++;
  const packLenStr = body.slice(1, i);
  if (body[i] !== ',') {
    return { ok: false, reason: 'malformed pack-len', raw };
  }
  const packLen = toInt(packLenStr);

  const fields = body.slice(i + 1).split(',');
  // Expected ordering (indices 0-based within `fields`):
  //  0 ID
  //  1 cmd
  //  2 alm-code
  //  3 alm-data
  //  4 date-time
  //  5 fix_flag
  //  6 lat
  //  7 lng
  //  8 sat-quantity
  //  9 HDOP
  // 10 speed
  // 11 course
  // 12 altitude
  // 13 odometer
  // 14 MCC|MNC|LAC|CI
  // 15 CSQ
  // 16 system-sta  (8-hex)
  // 17 in-sta      (2-hex)
  // 18 out-sta     (2-hex)
  // 19 voltages V1|V2|...
  // 20 pro-code
  // 21 fuel (optional)
  // 22 temp (optional)
  if (fields.length < 19) {
    return { ok: false, reason: `too few fields (${fields.length})`, raw };
  }

  const cmdStr = fields[1]!;
  if (cmdStr !== '000' && cmdStr !== '010' && cmdStr !== '020') {
    return { ok: false, reason: `unexpected cmd=${cmdStr}`, raw };
  }

  const { extV, batV } = parseVoltages(fields[19]);
  const cell = parseCellInfo(fields[14]);

  const event: EventPacket = {
    packNo,
    packLen,
    deviceId: fields[0] ?? '',
    cmd: cmdStr as CmdType,
    almCode: toInt(fields[2]),
    almData: fields[3] ?? '',
    timestamp: parseGmtDateTime(fields[4]),
    fixFlag: (fields[5] === 'A' ? 'A' : 'V') as 'A' | 'V',
    lat: toFloat(fields[6]),
    lng: toFloat(fields[7]),
    satellites: toInt(fields[8]),
    hdop: toFloat(fields[9]),
    speedKph: toFloat(fields[10]),
    course: toFloat(fields[11]),
    altitude: toFloat(fields[12]),
    odometerMeters: toInt(fields[13]),
    mcc: cell.mcc,
    mnc: cell.mnc,
    lac: cell.lac,
    ci: cell.ci,
    csq: toInt(fields[15]),
    systemSta: toHexInt(fields[16]),
    inSta: toHexInt(fields[17]),
    outSta: toHexInt(fields[18]),
    extV,
    batV,
    raw,
  };

  return { ok: true, event };
}

// ---------- Encode ----------

/**
 * Encode a downlink command frame. Returns the bytes to write on the wire,
 * including \r\n. The caller doesn't need to know about pack-len or checksum.
 *
 * Per V1.6 §2:
 *   pack-len = byte-length of ",<ID>,<cmd-code>,<cmd-data>"
 *
 * We always emit a pack-no from the ring; for ack replies pass an `ackPackNo`
 * so we echo the device's pack-no.
 */
export function encodeCommand(params: {
  deviceId: string;
  cmdCode: string;
  cmdData?: string;
  ackPackNo?: string;
}): Buffer {
  const { deviceId, cmdCode, cmdData = '', ackPackNo } = params;
  const packNo = ackPackNo ?? nextPackNo();
  const body = `,${deviceId},${cmdCode}${cmdData ? ',' + cmdData : ''}`;
  const packLen = Buffer.byteLength(body, 'ascii');
  const beforeCs = `$$${packNo}${packLen}${body}`;
  const cs = checksum(beforeCs);
  return Buffer.from(`${beforeCs}${cs}\r\n`, 'ascii');
}

/**
 * Encode the ack for an 010 (or 020) event frame. Doc §010:
 *   Reply: "010,1"
 * The pack-no must match the originating event's pack-no.
 */
export function encodeAck(event: EventPacket): Buffer | null {
  if (event.cmd !== '010' && event.cmd !== '020') return null;
  return encodeCommand({
    deviceId: event.deviceId,
    cmdCode: event.cmd,
    cmdData: '1',
    ackPackNo: event.packNo,
  });
}
