/**
 * Format a number string with commas for readability
 * e.g., "1234567.890000" -> "1,234,567.890000"
 */
export function formatWithCommas(value: string): string {
  const [whole, decimal] = value.split(".");
  const formattedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimal ? `${formattedWhole}.${decimal}` : formattedWhole;
}
