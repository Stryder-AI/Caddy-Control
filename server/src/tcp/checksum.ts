/**
 * iStartek protocol checksum.
 *
 * Per V1.6 §2:
 *   "the lowest byte of the cumulative sum calculation result of all the data
 *    before the checksum, expressed in a 2-digit hexadecimal string format"
 *
 * This is NOT an XOR (NMEA 0183). It is a plain byte-sum mod 256.
 * Canonical example from the doc:
 *   "&&A20,021104023195429,800" => sum = 0x04DA, low byte = 0xDA => "DA"
 */
export function checksum(bytes: Buffer | string): string {
  const buf = typeof bytes === 'string' ? Buffer.from(bytes, 'ascii') : bytes;
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    sum = (sum + buf[i]!) & 0xffff;
  }
  return (sum & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

/** Verify the trailing 2 hex chars match the body before them. */
export function verifyChecksum(frame: string): boolean {
  if (frame.length < 3) return false;
  const body = frame.slice(0, -2);
  const given = frame.slice(-2).toUpperCase();
  return checksum(body) === given;
}
