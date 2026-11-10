import { describe, expect, it } from "vitest";
import { crc32, zip } from "../src/zip";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** Reads an archive back through its directory, the way an unzip tool does. */
function read(archive: Uint8Array) {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const end = archive.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const entries = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const mode = view.getUint32(at + 38, true) >>> 16;
    const local = view.getUint32(at + 42, true);
    const path = text(archive.subarray(at + 46, at + 46 + nameLength));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = archive.subarray(start, start + size);
    expect(view.getUint32(at + 16, true)).toBe(crc32(data));
    entries.push({ path, content: text(data), mode });
    at += 46 + nameLength;
  }
  return entries;
}

describe("zip", () => {
  it("computes the standard checksum", () => {
    expect(crc32(new TextEncoder().encode("hello"))).toBe(0x3610a686);
  });

  it("stores files that read back intact, with the script marked executable", () => {
    const archive = zip([
      { path: "rules.md", content: "## Workflow: café\n" },
      { path: "skills/build/SKILL.md", content: "" },
      { path: "install.sh", content: "#!/usr/bin/env bash\n", executable: true },
    ]);
    expect(read(archive)).toEqual([
      { path: "rules.md", content: "## Workflow: café\n", mode: 0o100644 },
      { path: "skills/build/SKILL.md", content: "", mode: 0o100644 },
      { path: "install.sh", content: "#!/usr/bin/env bash\n", mode: 0o100755 },
    ]);
  });
});
