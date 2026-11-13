/**
 * Convert lovelace (bigint string) to ADA string with 6 decimal places
 * 1 ADA = 1,000,000 lovelace
 */
export function lovelaceToAda(lovelace: string): string {
  return formatTokenAmount(lovelace, 6);
}

/**
 * Format token amount based on decimals. Negative amounts keep a single leading sign.
 */
export function formatTokenAmount(quantity: string, decimals: number): string {
  if (decimals === 0) {
    return quantity;
  }
  const value = BigInt(quantity);
  const abs = value < 0n ? -value : value;
  const divisor = 10n ** BigInt(decimals);
  const decimalPart = (abs % divisor).toString().padStart(decimals, "0");
  return `${value < 0n ? "-" : ""}${abs / divisor}.${decimalPart}`;
}
