export interface ZipEntry {
  path: string;
  content: string;
  executable?: boolean;
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A zip archive of text files, stored without compression.
 * shortcut: no compression and no files over 4 GB, upgrade if a recipe ever produces large files.
 */
export function zip(entries: readonly ZipEntry[], date = new Date()): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const data = encoder.encode(entry.content);
    const crc = crc32(data);

    // Fields shared by the local header and the directory record: version needed,
    // UTF-8 names flag, stored method, time, date, checksum, sizes, name length, extra length.
    const shared = new DataView(new ArrayBuffer(26));
    shared.setUint16(0, 20, true);
    shared.setUint16(2, 0x0800, true);
    shared.setUint16(4, 0, true);
    shared.setUint16(6, time, true);
    shared.setUint16(8, day, true);
    shared.setUint32(10, crc, true);
    shared.setUint32(14, data.length, true);
    shared.setUint32(18, data.length, true);
    shared.setUint16(22, name.length, true);
    shared.setUint16(24, 0, true);
    const sharedBytes = new Uint8Array(shared.buffer);

    const local = new Uint8Array(4 + 26);
    new DataView(local.buffer).setUint32(0, 0x04034b50, true);
    local.set(sharedBytes, 4);
    parts.push(local, name, data);

    // Made on Unix, so unzip restores the file mode held in the external attributes.
    const record = new Uint8Array(46);
    const view = new DataView(record.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, (3 << 8) | 20, true);
    record.set(sharedBytes, 6);
    view.setUint32(38, (entry.executable ? 0o100755 : 0o100644) * 0x10000, true);
    view.setUint32(42, offset, true);
    directory.push(record, name);

    offset += local.length + name.length + data.length;
  }

  const directorySize = directory.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, offset, true);

  const archive = new Uint8Array(offset + directorySize + end.length);
  let position = 0;
  for (const part of [...parts, ...directory, end]) {
    archive.set(part, position);
    position += part.length;
  }
  return archive;
}
