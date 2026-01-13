/**
 * Validation utilities for the MCP server
 */

/**
 * Minimum length for a valid Cardano bech32 address
 * Addresses are typically 58-103 characters
 */
const MIN_ADDRESS_LENGTH = 50;

/**
 * Valid prefixes for Cardano addresses
 */
const MAINNET_PREFIX = "addr1";
const TESTNET_PREFIX = "addr_test1";

/**
 * Check if a string is a valid Cardano address format
 *
 * This performs basic sanity checks:
 * - Validates the address starts with valid prefix (addr1 for mainnet, addr_test1 for testnet)
 * - Ensures minimum length for bech32 encoding
 *
 * Note: This is NOT cryptographic validation - it's a basic format check
 * to catch obvious errors before making an API call.
 *
 * @param address - The address string to validate
 * @returns true if the address appears to be valid format
 */
export function isValidCardanoAddress(address: string): boolean {
  if (typeof address !== "string") {
    return false;
  }

  const trimmed = address.trim();

  // Check minimum length
  if (trimmed.length < MIN_ADDRESS_LENGTH) {
    return false;
  }

  // Check valid prefix (mainnet or testnet)
  if (!trimmed.startsWith(MAINNET_PREFIX) && !trimmed.startsWith(TESTNET_PREFIX)) {
    return false;
  }

  return true;
}
