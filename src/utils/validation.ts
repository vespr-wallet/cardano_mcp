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
 * @param address - The value to validate; non-strings (e.g. untyped tool input) are rejected
 * @returns true if the address appears to be valid format
 */
export function isValidCardanoAddress(address: unknown): boolean {
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

/**
 * Pool ID prefix for bech32 encoded stake pool IDs
 */
const POOL_PREFIX = "pool1";

/**
 * Validates a Cardano stake pool ID in bech32 format.
 * Pool IDs start with "pool1" prefix and are typically 56 characters long.
 *
 * Note: This is NOT cryptographic validation - it's a basic format check
 * to catch obvious errors before making an API call.
 *
 * @param poolId - The value to validate; non-strings (e.g. untyped tool input) are rejected
 * @returns true if the pool ID appears to be valid format
 */
export function isValidPoolId(poolId: unknown): boolean {
  if (typeof poolId !== "string") {
    return false;
  }

  const trimmed = poolId.trim();

  // Pool IDs are bech32 encoded, start with "pool1", ~56 chars
  if (!trimmed.startsWith(POOL_PREFIX)) {
    return false;
  }

  // Pool IDs are typically 56 characters
  if (trimmed.length < 50 || trimmed.length > 60) {
    return false;
  }

  return true;
}

/**
 * The unit the VESPR backend uses for ADA (hex of "Ada").
 */
export const ADA_UNIT = "416461";

/** Inputs accepted as ADA, compared case-insensitively. */
const ADA_UNIT_ALIASES = new Set(["ada", "lovelace", ADA_UNIT]);

/** Policy ID (56 hex chars), an optional "." separator, and a hex asset name of up to 32 bytes. */
const ASSET_UNIT_REGEX = /^[0-9a-f]{56}\.?(?:[0-9a-f]{2}){0,32}$/;

/**
 * Normalizes a token unit for the VESPR backend: "ADA", "lovelace" and "416461" become {@link ADA_UNIT};
 * any other unit must be a policy ID plus hex asset name (optionally separated by "."), returned lowercase
 * without the separator.
 *
 * @returns the normalized unit, or null when the input isn't a valid unit
 */
export function normalizeAssetUnit(unit: string): string | null {
  const trimmed = unit.trim().toLowerCase();
  if (ADA_UNIT_ALIASES.has(trimmed)) {
    return ADA_UNIT;
  }
  return ASSET_UNIT_REGEX.test(trimmed) ? trimmed.replace(".", "") : null;
}

/** A transaction hash: 64 hex characters. */
const TX_HASH_REGEX = /^[0-9a-f]{64}$/;

/**
 * Normalizes a transaction hash to lowercase.
 *
 * @returns the lowercase hash, or null when the input isn't 64 hex characters
 */
export function normalizeTxHash(txHash: string): string | null {
  const normalized = txHash.trim().toLowerCase();
  return TX_HASH_REGEX.test(normalized) ? normalized : null;
}
