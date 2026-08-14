/**
 * Reproduces the paper's performance benchmarks on the updated stack:
 *  - vote encryption time (2048-bit Paillier)
 *  - homomorphic addition, scaling with number of votes
 *  - negligible-knowledge verification data generation (decrypt + recover w)
 *  - NKP verification time (re-encrypt and compare)
 *
 * Run: npx ts-node scripts/benchmark.ts        (pure crypto, no chain needed)
 * Sizes are capped by BENCH_MAX_VOTES (default 100000) to keep runtime sane;
 * raise it to reproduce the larger rows of the paper's table.
 */
import { encodeBallot } from "../lib/encoding";
import {
  addCiphertexts,
  decrypt,
  encrypt,
  generateKeys,
  recoverRandomFactor,
  verifyTally,
} from "../lib/paillier";

const KEY_BITS = 2048;
const MAX_VOTES = Number(process.env.BENCH_MAX_VOTES || 100000);
const ENCRYPT_SAMPLES = 5;

async function main() {
  console.log(`Generating ${KEY_BITS}-bit Paillier keypair...`);
  let t0 = performance.now();
  const { pub, priv } = await generateKeys(KEY_BITS);
  console.log(`Key generation: ${((performance.now() - t0) / 1000).toFixed(2)} s\n`);

  // Vote encryption time (average of ENCRYPT_SAMPLES).
  const ballot = encodeBallot(0);
  t0 = performance.now();
  let last: { ciphertext: bigint; r: bigint } = encrypt(pub, ballot);
  for (let i = 1; i < ENCRYPT_SAMPLES; i++) last = encrypt(pub, ballot);
  const encMs = (performance.now() - t0) / ENCRYPT_SAMPLES;
  console.log(`Vote encryption (avg of ${ENCRYPT_SAMPLES}): ${encMs.toFixed(1)} ms`);

  // Homomorphic addition scaling. Additions all use the same ciphertext,
  // which does not change the cost of a modular multiplication.
  const c = last.ciphertext;
  console.log(`\nVotes\tHomomorphic addition (s)`);
  for (let n = 1; n <= MAX_VOTES; n *= 10) {
    t0 = performance.now();
    let acc = c;
    for (let i = 1; i < n; i++) acc = addCiphertexts(pub, acc, c);
    console.log(`${n}\t${((performance.now() - t0) / 1000).toFixed(2)}`);
  }

  // NKP data generation and verification, on a small real tally.
  const votes = 1000;
  let acc = c;
  for (let i = 1; i < votes; i++) acc = addCiphertexts(pub, acc, c);
  t0 = performance.now();
  const m = decrypt(priv, acc);
  const w = recoverRandomFactor(priv, acc, m);
  console.log(
    `\nNKP data generation (decrypt + recover w, ${votes} votes): ` +
      `${((performance.now() - t0) / 1000).toFixed(2)} s`
  );
  t0 = performance.now();
  const ok = verifyTally(pub, acc, m, w);
  console.log(
    `NKP verification (re-encrypt + compare): ` +
      `${((performance.now() - t0) / 1000).toFixed(2)} s (valid: ${ok})`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
