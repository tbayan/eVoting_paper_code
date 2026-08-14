import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";

dotenv.config();

// Secrets come from .env (see .env.example). Never commit keys to this file.
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 2000,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
    },
    ...(SEPOLIA_RPC_URL && PRIVATE_KEY
      ? {
          sepolia: {
            url: SEPOLIA_RPC_URL,
            accounts: [PRIVATE_KEY],
          },
        }
      : {}),
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
};

export default config;
