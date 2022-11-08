import { FakeContract, smock } from "@defi-wonderland/smock";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { abi as POOL_ABI } from "@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";

import { IUniswapV3Pool } from "../src/types/@uniswap/v3-core/contracts/interfaces";
import { VolOracle } from "../src/types/contracts";
import { VolOracle__factory } from "../src/types/factories/contracts";

chai.use(solidity);
chai.use(smock.matchers);
const { expect } = chai;

describe("Vol Oracle tests", () => {
  let volOracle: VolOracle;
  let deployer: SignerWithAddress;
  let uniV3Pool: FakeContract<IUniswapV3Pool>;
  const OBSERVATION_SIZE = 345600;
  const UNIV3_MAX_CARDINALITY = 65535;

  beforeEach("deploy contracts", async () => {
    [deployer] = await ethers.getSigners();
    const volOracleFactory = <VolOracle__factory>await ethers.getContractFactory("VolOracle");
    volOracle = await volOracleFactory.connect(deployer).deploy();
    uniV3Pool = await smock.fake(POOL_ABI);
  });

  it("tests constants", async () => {
    expect(await volOracle.OBSERVATION_SIZE()).to.equal(OBSERVATION_SIZE);
    expect(await volOracle.UNIV3_MAX_CARDINALITY()).to.equal(UNIV3_MAX_CARDINALITY);
  });

  it("cannot initialize a pool with low cardinality", async () => {
    uniV3Pool.slot0.returns({
      sqrtPriceX96: 0,
      tick: 0,
      observationIndex: 0,
      observationCardinality: 0,
      observationCardinalityNext: 0,
      feeProtocol: 0,
      unlocked: false,
    });
    await expect(volOracle.initPool(uniV3Pool.address)).to.be.revertedWith("Pool not at max cardinality");
  });

  it("initializes a pool", async () => {
    const mockObservationIndex = 10;
    uniV3Pool.slot0.returns({
      sqrtPriceX96: 0,
      tick: 0,
      observationIndex: mockObservationIndex,
      observationCardinality: UNIV3_MAX_CARDINALITY,
      observationCardinalityNext: 0,
      feeProtocol: 0,
      unlocked: false,
    });
    await volOracle.initPool(uniV3Pool.address);
    const latestBlock = await ethers.provider.getBlock("latest");
    const oracleState = await volOracle.oracleStates(uniV3Pool.address);
    expect(oracleState.observationIndex).to.equal(0);
    expect(oracleState.lastObservationIndex).to.equal(mockObservationIndex);
    expect(oracleState.lastBlockTimestamp).to.equal(latestBlock.timestamp);
  });
});
