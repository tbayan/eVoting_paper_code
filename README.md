# Blockchain Voting System v2

Updated implementation of the blockchain-based confidentiality-preserving e-voting
system with negligible-knowledge verification. This is a modernisation of the
original prototype (https://github.com/byt411/BlockchainVotingSystem, 2022).

This repository is the reference implementation for the paper:

> Brian Yim Tam, Talgar Bayan, Richard Banach.
> *A Blockchain-Based Confidentiality-Preserving Electronic Voting System,
> with Negligible-Knowledge Verification.* (under review)

All performance and gas figures reported in the paper can be reproduced with
the scripts in this repository (see Usage below).

## What changed compared to the original

**Stack**
- Solidity 0.8.12 -> 0.8.20 (stable 0.8.x line)
- Hardhat 2.6 + Waffle (deprecated) -> Hardhat 2 LTS + @nomicfoundation/hardhat-toolbox
- ethers v5 -> ethers v6, tests use custom-error matchers and network helpers
- Ropsten testnet (shut down in 2022) -> Sepolia
- Secrets moved out of hardhat.config.ts into .env (the original had a private
  key and Infura key committed in the config file)
- Forked `paillier-bigint` dependency replaced by a small local Paillier module
  (`lib/paillier.ts`) that supports random-factor recovery directly

**Contracts**
- Custom errors instead of revert strings (cheaper gas, machine-readable)
- `creator` and `endtime` are `immutable`; the duplicate creator assignment in the
  old constructor is fixed
- Dynamic option arrays (bounded by `MAX_OPTIONS`) instead of fixed `[10]` arrays
- Verification storage now matches the negligible-knowledge scheme in the revised
  paper: the contract stores the ciphertext total `C`, the decrypted encoded
  total `M`, and the combined random factor `w`, replacing the old interactive
  ZKP fields (`u`, `a`, `z`, `e`, `negativeR`, encrypted zero)
- Events for results and verification publication; `VoteCast` now indexes the voter

**Verification model (negligible-knowledge)**
1. Ballots are Paillier ciphertexts published on-chain.
2. After the election, the tallier multiplies all ciphertexts mod N^2 to get
   `C = Enc(M, w)` where `M` is the encoded tally and `w = prod(r_v) mod N`.
3. The tallier decrypts `C` to get `M`, recovers `w` (enhanced decryption), and
   publishes `(C, M, w)` on-chain.
4. Anyone can verify with only public data: recompute `C` from the on-chain
   ballots, check `Enc(M, w) == C`, and decode `M` into per-option counts.

## Usage

```bash
npm install
npx hardhat compile
npx hardhat test          # contract tests + full end-to-end election test
REPORT_GAS=true npx hardhat test   # with gas report
npx ts-node scripts/benchmark.ts   # crypto benchmarks (2048-bit keys)
npx hardhat run scripts/gas-measure.ts   # gas per vote with genuine 2048-bit ciphertexts
```

`gas-measure.ts` reproduces the gas figures quoted in the paper
(~975k gas for a first vote, ~267k for a replacement vote); `benchmark.ts`
reproduces the encryption, homomorphic-addition, and negligible-knowledge
verification timings.

To deploy on Sepolia, copy `.env.example` to `.env`, fill in your RPC URL and
private key, then:

```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

## Layout

- `contracts/` - `Election.sol`, `Deployer.sol` (factory), `ElectionStructs.sol`
- `lib/paillier.ts` - Paillier keygen/encrypt/decrypt, homomorphic addition,
  random-factor recovery, NKP tally verification
- `lib/encoding.ts` - ballot encoding (9 digits per option)
- `test/` - contract unit tests and an end-to-end election test that runs the
  whole protocol including third-party verification
- `scripts/` - deployment and benchmarks

The React user interface of the original prototype is not ported yet; the
contracts and the cryptographic protocol are the parts the paper depends on.
