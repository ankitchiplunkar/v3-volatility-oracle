import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";

import { VolOracle } from "../../types/VolOracle";
import type { VolOracle__factory } from "../../types/factories/VolOracle__factory";

export async function deployVolOracleFixture(): Promise<{ volOracle: VolOracle }> {
  const signers: SignerWithAddress[] = await ethers.getSigners();
  const admin: SignerWithAddress = signers[0];

  const VolOracleFactory: VolOracle__factory = <VolOracle__factory>await ethers.getContractFactory("VolOracle");
  const volOracle: VolOracle = <VolOracle>await VolOracleFactory.connect(admin).deploy();
  await volOracle.deployed();

  return { volOracle: volOracle };
}
