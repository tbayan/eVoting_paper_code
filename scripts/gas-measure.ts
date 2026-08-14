/**
 * Measures real gas usage of recordVote with genuine 2048-bit Paillier
 * ciphertexts (the numbers the paper should quote), for first votes and
 * replacement votes.
 *
 * Run: npx hardhat run scripts/gas-measure.ts
 */
import { ethers } from "hardhat";

import { encodeBallot } from "../lib/encoding";
import { encrypt, generateKeys } from "../lib/paillier";

const OPTIONS = [
  { name: "Party A", acronym: "PA", logourl: "", power: 0 },
  { name: "Party B", acronym: "PB", logourl: "", power: 1 },
];

async function main() {
  console.log("Generating 2048-bit keypair...");
  const { pub } = await generateKeys(2048);
  const signers = await ethers.getSigners();
  const deployer = await ethers.deployContract("Deployer");
  const latest = await ethers.provider.getBlock("latest");
  const endtime = latest!.timestamp + 86400;
  const electionAddress = await deployer.deployElection.staticCall(
    OPTIONS,
    endtime,
    "Gas Test",
    pub.n.toString(),
    pub.g.toString()
  );
  await deployer.deployElection(
    OPTIONS,
    endtime,
    "Gas Test",
    pub.n.toString(),
    pub.g.toString()
  );
  const election = await ethers.getContractAt("Election", electionAddress);

  const firstVoteGas: bigint[] = [];
  const replaceVoteGas: bigint[] = [];
  for (let i = 0; i < 5; i++) {
    const c1 = encrypt(pub, encodeBallot(i % 2)).ciphertext.toString();
    console.log(`ciphertext length: ${c1.length} decimal digits`);
    const tx1 = await election.connect(signers[i + 1]).recordVote(c1);
    firstVoteGas.push((await tx1.wait())!.gasUsed);

    const c2 = encrypt(pub, encodeBallot((i + 1) % 2)).ciphertext.toString();
    const tx2 = await election.connect(signers[i + 1]).recordVote(c2);
    replaceVoteGas.push((await tx2.wait())!.gasUsed);
  }

  const avg = (a: bigint[]) => a.reduce((x, y) => x + y, 0n) / BigInt(a.length);
  console.log(`\nFirst vote gas   (avg of 5): ${avg(firstVoteGas)}`);
  console.log(`Replacement vote (avg of 5): ${avg(replaceVoteGas)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
