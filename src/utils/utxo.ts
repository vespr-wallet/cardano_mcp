/**
 * Decoding of CIP-30 style `TransactionUnspentOutput` CBOR hex, as returned by the VESPR backend.
 *
 * Only the CBOR subset that appears in transaction outputs is supported (unsigned/negative ints, byte
 * and text strings, arrays, maps, tags and simple values). Floats are rejected.
 */

type CborItem =
  | { kind: "uint"; value: bigint }
  | { kind: "nint"; value: bigint }
  | { kind: "bytes"; value: Uint8Array }
  | { kind: "text"; value: string }
  | { kind: "array"; items: CborItem[] }
  | { kind: "map"; entries: Array<[CborItem, CborItem]> }
  | { kind: "tag"; tag: bigint; value: CborItem }
  | { kind: "simple"; value: number };

const BREAK = Symbol("break");

class CborReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  readTopLevel(): CborItem {
    const item = this.readItem();
    if (this.offset !== this.bytes.length) {
      throw new Error("Unexpected trailing bytes after CBOR item");
    }
    return item;
  }

  private readByte(): number {
    const byte = this.bytes[this.offset];
    if (byte === undefined) {
      throw new Error("Unexpected end of CBOR data");
    }
    this.offset += 1;
    return byte;
  }

  private readSlice(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length) {
      throw new Error("Unexpected end of CBOR data");
    }
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  /** Reads the argument of a head byte; returns null for the indefinite-length marker (31). */
  private readArgument(additionalInfo: number): bigint | null {
    if (additionalInfo < 24) {
      return BigInt(additionalInfo);
    }
    if (additionalInfo === 31) {
      return null;
    }
    const lengths: Record<number, number> = { 24: 1, 25: 2, 26: 4, 27: 8 };
    const length = lengths[additionalInfo];
    if (length === undefined) {
      throw new Error(`Invalid CBOR additional info ${additionalInfo}`);
    }
    let value = 0n;
    for (const byte of this.readSlice(length)) {
      value = (value << 8n) | BigInt(byte);
    }
    return value;
  }

  private readLength(argument: bigint): number {
    if (argument > BigInt(this.bytes.length - this.offset)) {
      throw new Error("CBOR length exceeds the remaining data");
    }
    return Number(argument);
  }

  private readItem(): CborItem {
    const item = this.readItemOrBreak();
    if (item === BREAK) {
      throw new Error("Unexpected CBOR break");
    }
    return item;
  }

  private readItemOrBreak(): CborItem | typeof BREAK {
    const head = this.readByte();
    const majorType = head >> 5;
    const additionalInfo = head & 0x1f;

    if (head === 0xff) {
      return BREAK;
    }

    const argument = this.readArgument(additionalInfo);

    switch (majorType) {
      case 0:
      case 1: {
        if (argument === null) {
          throw new Error("Indefinite-length integer is not valid CBOR");
        }
        return majorType === 0 ? { kind: "uint", value: argument } : { kind: "nint", value: -1n - argument };
      }
      case 2:
      case 3: {
        const bytes = argument === null ? this.readChunks(majorType) : this.readSlice(this.readLength(argument));
        return majorType === 2
          ? { kind: "bytes", value: bytes }
          : { kind: "text", value: new TextDecoder().decode(bytes) };
      }
      case 4: {
        const items: CborItem[] = [];
        if (argument === null) {
          for (let next = this.readItemOrBreak(); next !== BREAK; next = this.readItemOrBreak()) {
            items.push(next);
          }
        } else {
          for (let i = 0, length = this.readLength(argument); i < length; i++) {
            items.push(this.readItem());
          }
        }
        return { kind: "array", items };
      }
      case 5: {
        const entries: Array<[CborItem, CborItem]> = [];
        if (argument === null) {
          for (let key = this.readItemOrBreak(); key !== BREAK; key = this.readItemOrBreak()) {
            entries.push([key, this.readItem()]);
          }
        } else {
          for (let i = 0, length = this.readLength(argument); i < length; i++) {
            entries.push([this.readItem(), this.readItem()]);
          }
        }
        return { kind: "map", entries };
      }
      case 6: {
        if (argument === null) {
          throw new Error("Indefinite-length tag is not valid CBOR");
        }
        return { kind: "tag", tag: argument, value: this.readItem() };
      }
      default: {
        if (additionalInfo >= 25) {
          throw new Error("CBOR floats are not supported");
        }
        return { kind: "simple", value: Number(argument) };
      }
    }
  }

  private readChunks(majorType: number): Uint8Array {
    const chunks: Uint8Array[] = [];
    for (let next = this.readItemOrBreak(); next !== BREAK; next = this.readItemOrBreak()) {
      if (majorType === 2 && next.kind === "bytes") {
        chunks.push(next.value);
      } else if (majorType === 3 && next.kind === "text") {
        chunks.push(new TextEncoder().encode(next.value));
      } else {
        throw new Error("Invalid chunk in indefinite-length CBOR string");
      }
    }
    return Uint8Array.from(chunks.flatMap((chunk) => Array.from(chunk)));
  }
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error("Invalid hex string");
  }
  return Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function bech32Polymod(values: number[]): number {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let checksum = 1;
  for (const value of values) {
    const top = checksum >> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    generators.forEach((generator, i) => {
      if ((top >> i) & 1) {
        checksum ^= generator;
      }
    });
  }
  return checksum;
}

function bech32Encode(hrp: string, data: Uint8Array): string {
  // Regroup 8-bit bytes into 5-bit words
  const words: number[] = [];
  let accumulator = 0;
  let bits = 0;
  for (const byte of data) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((accumulator >> bits) & 31);
    }
  }
  if (bits > 0) {
    words.push((accumulator << (5 - bits)) & 31);
  }

  const expandedHrp = [...hrp].map((c) => c.charCodeAt(0) >> 5);
  expandedHrp.push(0, ...[...hrp].map((c) => c.charCodeAt(0) & 31));
  const polymod = bech32Polymod([...expandedHrp, ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = [0, 1, 2, 3, 4, 5].map((i) => (polymod >> (5 * (5 - i))) & 31);

  return `${hrp}1${[...words, ...checksum].map((word) => BECH32_CHARSET.charAt(word)).join("")}`;
}

/**
 * Encode raw address bytes as bech32. Shelley payment addresses (header types 0-7) get the `addr` /
 * `addr_test` prefix; anything else (e.g. Byron) is returned as hex.
 */
export function addressBytesToBech32(bytes: Uint8Array): string {
  const header = bytes[0];
  if (header === undefined || header >> 4 > 7) {
    return bytesToHex(bytes);
  }
  return bech32Encode((header & 0x0f) === 1 ? "addr" : "addr_test", bytes);
}

export interface DecodedUtxoToken {
  policy_id: string;
  asset_name_hex: string;
  quantity: bigint;
}

export interface DecodedUtxo {
  tx_hash: string;
  output_index: number;
  address: string;
  lovelace: bigint;
  tokens: DecodedUtxoToken[];
}

function invalid(what: string): never {
  throw new Error(`Invalid UTxO CBOR: expected ${what}`);
}

function asArray(item: CborItem | undefined, what: string): CborItem[] {
  return item?.kind === "array" ? item.items : invalid(what);
}

function asMap(item: CborItem | undefined, what: string): Array<[CborItem, CborItem]> {
  return item?.kind === "map" ? item.entries : invalid(what);
}

function asBytes(item: CborItem | undefined, what: string): Uint8Array {
  return item?.kind === "bytes" ? item.value : invalid(what);
}

function asUint(item: CborItem | undefined, what: string): bigint {
  return item?.kind === "uint" ? item.value : invalid(what);
}

function decodeValue(item: CborItem | undefined): { lovelace: bigint; tokens: DecodedUtxoToken[] } {
  if (item?.kind === "uint") {
    return { lovelace: item.value, tokens: [] };
  }
  const [coin, multiAsset] = asArray(item, "value");
  const tokens: DecodedUtxoToken[] = [];
  for (const [policy, assets] of asMap(multiAsset, "multi-asset map")) {
    const policyId = bytesToHex(asBytes(policy, "policy id"));
    for (const [assetName, quantity] of asMap(assets, "asset map")) {
      tokens.push({
        policy_id: policyId,
        asset_name_hex: bytesToHex(asBytes(assetName, "asset name")),
        quantity: asUint(quantity, "asset quantity"),
      });
    }
  }
  return { lovelace: asUint(coin, "lovelace"), tokens };
}

/**
 * Decode a `TransactionUnspentOutput` (`[input, output]`) CBOR hex string. Supports both the legacy
 * array output format and the post-Alonzo map format.
 */
export function decodeUtxoCborHex(hex: string): DecodedUtxo {
  const [input, output] = asArray(new CborReader(hexToBytes(hex)).readTopLevel(), "utxo");
  const [txHash, outputIndex] = asArray(input, "transaction input");

  let addressItem: CborItem | undefined;
  let valueItem: CborItem | undefined;
  if (output?.kind === "map") {
    const field = (key: bigint) => output.entries.find(([k]) => k.kind === "uint" && k.value === key)?.[1];
    addressItem = field(0n);
    valueItem = field(1n);
  } else {
    [addressItem, valueItem] = asArray(output, "transaction output");
  }

  return {
    tx_hash: bytesToHex(asBytes(txHash, "transaction hash")),
    output_index: Number(asUint(outputIndex, "output index")),
    address: addressBytesToBech32(asBytes(addressItem, "address")),
    ...decodeValue(valueItem),
  };
}
