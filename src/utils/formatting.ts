/**
 * Format a number string with commas for readability
 * e.g., "1234567.890000" -> "1,234,567.890000"
 */
export function formatWithCommas(value: string): string {
  const [whole, decimal] = value.split(".");
  const formattedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimal ? `${formattedWhole}.${decimal}` : formattedWhole;
}

/**
 * Rounds a decimal amount string half-up to `decimals` places and drops trailing zeros, without going through a
 * float, so large BigNumber strings keep every digit. It also clears float noise such as "36.085547000000005".
 * Values that aren't plain decimals (e.g. "1e-7"), and amounts whose decimals are unknown, are kept as-is.
 */
export function roundAmount(value: string, decimals: number | null): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (decimals === null || match === null) {
    return value;
  }
  const [, whole = "0", fraction = ""] = match;
  const roundUp = (fraction[decimals] ?? "0") >= "5" ? 1n : 0n;
  const scaled = (BigInt(whole + fraction.slice(0, decimals).padEnd(decimals, "0")) + roundUp)
    .toString()
    .padStart(decimals + 1, "0");
  const integerPart = scaled.slice(0, scaled.length - decimals);
  const fractionPart = scaled.slice(scaled.length - decimals).replace(/0+$/, "");
  return fractionPart ? `${integerPart}.${fractionPart}` : integerPart;
}
