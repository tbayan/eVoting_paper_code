/**
 * Ballot encoding: each voting option gets a disjoint block of decimal
 * digits in a single plaintext, so that homomorphically adding all ballots
 * yields the per-option totals in one number (see the paper, Section on
 * Ballot Encoding). 9 digits per option supports up to 999,999,999 votes
 * per option.
 */

export const DIGITS_PER_OPTION = 9;

/** Ballot plaintext for a vote for option with index `power`: 10^(9*power). */
export function encodeBallot(power: number): bigint {
  return 10n ** (BigInt(DIGITS_PER_OPTION) * BigInt(power));
}

/** Split the decrypted total back into per-option counts, index 0 first. */
export function decodeTally(encodedTotal: bigint, numOptions: number): number[] {
  let s = encodedTotal.toString();
  while (s.length < DIGITS_PER_OPTION * numOptions) s = "0" + s;
  const counts: number[] = [];
  for (let i = 0; i < numOptions; i++) {
    const end = s.length - i * DIGITS_PER_OPTION;
    counts.push(Number(s.slice(Math.max(0, end - DIGITS_PER_OPTION), end)));
  }
  return counts;
}
