import { encodeQr } from "./qr";

// Reference digests produced by the `qrcode` npm package (1.5.4, byte mode, level M, forced mask)
// for the same payloads; equal digests mean module-for-module identical symbols.
const payload = (n: number) => Array.from({ length: n }, (_, i) => "2@Ab9/+xYz=,"[i % 12]).join("");

function fnv(matrix: boolean[][]): string {
  let h = 0x811c9dc5;
  for (const row of matrix) {
    for (const dark of row) {
      h ^= dark ? 0x31 : 0x30;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16);
}

const REFERENCE: Array<[length: number, mask: number, size: number, digest: string]> = [
  [1, 0, 21, "8a167c9d"],
  [14, 7, 21, "b21d527d"],
  [15, 3, 25, "c84035b5"],
  [155, 5, 53, "508f8f86"],
  [240, 0, 61, "a562bc39"],
  [400, 7, 77, "db23c3d8"],
  [900, 3, 113, "37472b0f"],
  [2331, 5, 177, "dea43627"],
];

describe("encodeQr", () => {
  it.each(REFERENCE)("matches the reference symbol for %i bytes, mask %i", (length, mask, size, digest) => {
    const matrix = encodeQr(payload(length), mask);
    expect(matrix.length).toBe(size);
    expect(fnv(matrix)).toBe(digest);
  });

  it("picks the smallest version and a valid mask automatically", () => {
    const matrix = encodeQr(payload(240));
    expect(matrix.length).toBe(61);
    expect(matrix.every((row) => row.length === 61)).toBe(true);
  });

  it("rejects payloads beyond version 40", () => {
    expect(() => encodeQr(payload(2332))).toThrow(RangeError);
  });
});
