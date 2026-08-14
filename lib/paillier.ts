import { lcm, modInv, modPow, prime, randBetween } from "bigint-crypto-utils";

/**
 * Minimal Paillier implementation for the e-voting system.
 *
 * Replaces the forked paillier-bigint dependency of the original prototype.
 * The one capability the fork added - recovering the random factor r of a
 * ciphertext during decryption - is provided here by recoverRandomFactor(),
 * which is what the negligible-knowledge verification of the tally relies on:
 * the tallier publishes (C, M, w) and anyone can check C == Enc(M, w).
 */

export interface PublicKey {
  n: bigint;
  g: bigint;
  n2: bigint; // n^2, cached
}

export interface PrivateKey {
  lambda: bigint;
  mu: bigint;
  pub: PublicKey;
}

const L = (x: bigint, n: bigint): bigint => (x - 1n) / n;

export function publicKey(n: bigint, g?: bigint): PublicKey {
  return { n, g: g ?? n + 1n, n2: n * n };
}

/** Generate a Paillier keypair; g = n + 1 (standard choice). */
export async function generateKeys(
  bitLength = 2048
): Promise<{ pub: PublicKey; priv: PrivateKey }> {
  let p: bigint, q: bigint, n: bigint;
  do {
    p = await prime(Math.floor(bitLength / 2) + 1);
    q = await prime(Math.floor(bitLength / 2));
    n = p * q;
  } while (p === q || n.toString(2).length < bitLength);

  const pub = publicKey(n);
  const lambda = lcm(p - 1n, q - 1n) as bigint;
  const mu = modInv(L(modPow(pub.g, lambda, pub.n2), n), n);
  return { pub, priv: { lambda, mu, pub } };
}

/** Uniform random factor r in Z_n* . */
export function randomFactor(pub: PublicKey): bigint {
  // For n = pq with large primes, a uniform draw from [1, n-1] is coprime
  // with n except with negligible probability; check anyway.
  let r: bigint;
  do {
    r = randBetween(pub.n - 1n, 1n);
  } while (gcd(r, pub.n) !== 1n);
  return r;
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

/** Enc(m, r) = g^m * r^n mod n^2. Returns the ciphertext and the r used. */
export function encrypt(
  pub: PublicKey,
  m: bigint,
  r?: bigint
): { ciphertext: bigint; r: bigint } {
  const rr = r ?? randomFactor(pub);
  const ciphertext =
    (modPow(pub.g, m, pub.n2) * modPow(rr, pub.n, pub.n2)) % pub.n2;
  return { ciphertext, r: rr };
}

/** Dec(c) = L(c^lambda mod n^2) * mu mod n. */
export function decrypt(priv: PrivateKey, c: bigint): bigint {
  const { n, n2 } = priv.pub;
  return (L(modPow(c, priv.lambda, n2), n) * priv.mu) % n;
}

/** Homomorphic addition: Enc(m1) (*) Enc(m2) = Enc(m1 + m2). */
export function addCiphertexts(pub: PublicKey, a: bigint, b: bigint): bigint {
  return (a * b) % pub.n2;
}

/**
 * Recover the random factor r of ciphertext c with known plaintext m
 * (the "enhanced" Paillier decryption): c * g^(-m) = r^n mod n^2, and
 * r = (r^n mod n)^(n^(-1) mod lambda) mod n.
 */
export function recoverRandomFactor(
  priv: PrivateKey,
  c: bigint,
  m: bigint
): bigint {
  const { n, n2, g } = priv.pub;
  const gInvM = modInv(modPow(g, m, n2), n2);
  const rPowN = ((c * gInvM) % n2) % n;
  const nInv = modInv(n % priv.lambda, priv.lambda);
  return modPow(rPowN, nInv, n);
}

/**
 * Negligible-knowledge verification of the tally: check that the published
 * encoded total M and random factor w re-encrypt to the published ciphertext
 * total C under the election public key.
 */
export function verifyTally(
  pub: PublicKey,
  encryptedTotal: bigint,
  encodedTotal: bigint,
  w: bigint
): boolean {
  return encrypt(pub, encodedTotal, w).ciphertext === encryptedTotal;
}
