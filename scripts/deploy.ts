import { ethers } from "hardhat";

async function main() {
  const maxFill = 100;

  const VolOracle = await ethers.getContractFactory("VolOracle");
  const volOracle = await VolOracle.deploy(maxFill);

  await volOracle.deployed();

  console.log(`Deployed VolOracle with maxFill ${maxFill} to address ${volOracle.address}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
