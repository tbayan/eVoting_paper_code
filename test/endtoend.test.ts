import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { decodeTally, encodeBallot } from "../lib/encoding";
import {
  addCiphertexts,
  decrypt,
  encrypt,
  generateKeys,
  publicKey,
  recoverRandomFactor,
  verifyTally,
} from "../lib/paillier";
import { Election } from "../typechain-types";

// 512-bit keys keep the test fast; production uses 2048 bits.
const KEY_BITS = 512;

const OPTIONS = [
  { name: "Party A", acronym: "PA", logourl: "", power: 0 },
  { name: "Party B", acronym: "PB", logourl: "", power: 1 },
  { name: "Party C", acronym: "PC", logourl: "", power: 2 },
];

describe("End-to-end election with negligible-knowledge verification", () => {
  async function electionFixture() {
    const { pub, priv } = await generateKeys(KEY_BITS);
    const signers = await ethers.getSigners();
    const deployer = await ethers.deployContract("Deployer");
    const endtime = (await time.latest()) + 3600;
    const electionAddress = await deployer.deployElection.staticCall(
      OPTIONS,
      endtime,
      "E2E Election",
      pub.n.toString(),
      pub.g.toString()
    );
    await deployer.deployElection(
      OPTIONS,
      endtime,
      "E2E Election",
      pub.n.toString(),
      pub.g.toString()
    );
    const election: Election = await ethers.getContractAt(
      "Election",
      electionAddress
    );
    return { election, endtime, pub, priv, signers };
  }

  it("runs a full election: encrypted voting, tallying, NKP publication, third-party verification", async () => {
    const { election, endtime, pub, priv, signers } = await loadFixture(
      electionFixture
    );

    // --- Voting phase: 7 voters, Party A: 3, Party B: 2, Party C: 2.
    const choices = [0, 0, 0, 1, 1, 2, 2];
    for (let i = 0; i < choices.length; i++) {
      const ballot = encodeBallot(choices[i]);
      const { ciphertext } = encrypt(pub, ballot);
      await election
        .connect(signers[i + 1])
        .recordVote(ciphertext.toString());
    }

    // One voter replaces their vote (coercion resistance): voter 7 moves C -> A.
    {
      const { ciphertext } = encrypt(pub, encodeBallot(0));
      await election.connect(signers[7]).recordVote(ciphertext.toString());
    }
    // Expected: A: 4, B: 2, C: 1.

    await time.increaseTo(endtime + 1);

    // --- Tallying phase (done by the election official, off-chain).
    const stored = await election.getVotes();
    const ballots = stored.slice(1).map((v: string) => BigInt(v)); // skip placeholder
    let encryptedTotal = ballots[0];
    for (let i = 1; i < ballots.length; i++) {
      encryptedTotal = addCiphertexts(pub, encryptedTotal, ballots[i]);
    }
    const encodedTotal = decrypt(priv, encryptedTotal);
    const counts = decodeTally(encodedTotal, OPTIONS.length);
    expect(counts).to.deep.equal([4, 2, 1]);

    // Recover w = prod(r_v) mod N via enhanced decryption.
    const w = recoverRandomFactor(priv, encryptedTotal, encodedTotal);

    // --- Publish results, then the NKP data.
    const results = OPTIONS.map((o, i) => ({ option: o, count: counts[i] }));
    await election.publishResults(results);
    await election.publishVerification(
      encryptedTotal.toString(),
      encodedTotal.toString(),
      w.toString()
    );

    // --- Verification phase: an independent party with only public data.
    const pubOnly = publicKey(
      BigInt(await election.pubkeyN()),
      BigInt(await election.pubkeyG())
    );
    const [pubC, pubM, pubW] = await election.getVerification();

    // 1. Tallying correctness: recompute the ciphertext product from the chain.
    const chainVotes = (await election.getVotes()).slice(1);
    let recomputed = BigInt(chainVotes[0]);
    for (let i = 1; i < chainVotes.length; i++) {
      recomputed = addCiphertexts(pubOnly, recomputed, BigInt(chainVotes[i]));
    }
    expect(recomputed).to.equal(BigInt(pubC));

    // 2. Decryption correctness (negligible-knowledge): Enc(M, w) == C.
    expect(verifyTally(pubOnly, BigInt(pubC), BigInt(pubM), BigInt(pubW))).to.be
      .true;

    // 3. Decoding correctness: published per-option counts match M.
    const publishedResults = await election.getResults();
    const decoded = decodeTally(BigInt(pubM), OPTIONS.length);
    for (let i = 0; i < OPTIONS.length; i++) {
      expect(Number(publishedResults[i].count)).to.equal(decoded[i]);
    }

    // A tampered tally must fail verification.
    expect(
      verifyTally(pubOnly, BigInt(pubC), BigInt(pubM) + 10n ** 9n, BigInt(pubW))
    ).to.be.false;
  });

  it("paillier: encrypt/decrypt/homomorphic addition/random factor recovery", async () => {
    const { pub, priv } = await generateKeys(KEY_BITS);
    const m1 = 123456789n;
    const m2 = 987654321n;
    const e1 = encrypt(pub, m1);
    const e2 = encrypt(pub, m2);
    expect(decrypt(priv, e1.ciphertext)).to.equal(m1);
    expect(decrypt(priv, e2.ciphertext)).to.equal(m2);

    const sum = addCiphertexts(pub, e1.ciphertext, e2.ciphertext);
    expect(decrypt(priv, sum)).to.equal(m1 + m2);

    // Recovered random factor of the sum equals r1*r2 mod N.
    const w = recoverRandomFactor(priv, sum, m1 + m2);
    expect(w).to.equal((e1.r * e2.r) % pub.n);
    expect(verifyTally(pub, sum, m1 + m2, w)).to.be.true;
  });

  it("ballot encoding round-trips", () => {
    const total =
      4n * encodeBallot(0) + 2n * encodeBallot(1) + 1n * encodeBallot(2);
    expect(decodeTally(total, 3)).to.deep.equal([4, 2, 1]);
    expect(decodeTally(0n, 3)).to.deep.equal([0, 0, 0]);
  });
});
