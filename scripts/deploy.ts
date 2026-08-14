import { ethers } from "hardhat";

async function main() {
  const deployer = await ethers.deployContract("Deployer");
  await deployer.waitForDeployment();
  console.log("Deployer deployed to:", await deployer.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
