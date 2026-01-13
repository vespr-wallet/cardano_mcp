/**
 * Convert lovelace (bigint string) to ADA string with 6 decimal places
 * 1 ADA = 1,000,000 lovelace
 */
export function lovelaceToAda(lovelace: string): string {
  const value = BigInt(lovelace);
  const ada = value / BigInt(1_000_000);
  const remainder = value % BigInt(1_000_000);
  const decimals = remainder.toString().padStart(6, "0");
  return `${ada}.${decimals}`;
}

/**
 * Format token amount based on decimals
 */
export function formatTokenAmount(quantity: string, decimals: number): string {
  if (decimals === 0) {
    return quantity;
  }
  const value = BigInt(quantity);
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const remainder = value % divisor;
  const decimalPart = remainder.toString().padStart(decimals, "0");
  return `${whole}.${decimalPart}`;
}
