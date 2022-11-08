import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";

import { VolOracle } from "../src/types/contracts";
import { VolOracle__factory } from "../src/types/factories/contracts";

chai.use(solidity);
const { expect } = chai;

describe("Vol Oracle tests", () => {
  let volOracle: VolOracle;
  let deployer: SignerWithAddress;

  beforeEach("deploy contracts", async () => {
    [deployer] = await ethers.getSigners();
    const volOracleFactory = <VolOracle__factory>await ethers.getContractFactory("VolOracle");
    volOracle = await volOracleFactory.connect(deployer).deploy();
  });

  it("tests constants", async () => {
    expect(await volOracle.OBSERVATION_SIZE()).to.equal(345600);
    expect(await volOracle.UNIV3_MAX_CARDINALITY()).to.equal(65535);
  });
});
