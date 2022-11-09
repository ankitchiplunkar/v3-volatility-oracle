import { FakeContract, smock } from "@defi-wonderland/smock";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { abi as POOL_ABI } from "@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json";
import chai from "chai";
import { ethers } from "hardhat";

import { IUniswapV3Pool } from "../src/types/@uniswap/v3-core/contracts/interfaces";
import { VolOracle } from "../src/types/contracts";
import { VolOracle__factory } from "../src/types/factories/contracts";

chai.use(smock.matchers);
const { expect } = chai;

describe("Vol Oracle tests", () => {
  let volOracle: VolOracle;
  let deployer: SignerWithAddress;
  let uniV3Pool: FakeContract<IUniswapV3Pool>;
  const OBSERVATION_SIZE = 345600;
  const UNIV3_MAX_CARDINALITY = 65535;

  const DUMB_SLOT = {
    sqrtPriceX96: 0,
    tick: 0,
    observationIndex: 0,
    observationCardinality: 0,
    observationCardinalityNext: 0,
    feeProtocol: 0,
    unlocked: false,
  };

  const DUMB_OBSERVATION = {
    blockTimestamp: 0,
    tickCumulative: 0,
    secondsPerLiquidityCumulativeX128: 0,
    initialized: true,
  };

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

  describe("Pool initialization", () => {
    it("cannot initialize a pool with low cardinality", async () => {
      uniV3Pool.slot0.returns(DUMB_SLOT);
      await expect(volOracle.initPool(uniV3Pool.address)).to.be.revertedWith("Pool not at min cardinality");
    });

    it("Should fail if the pool has already been initialized", async () => {
      const mockObservationIndex = 10;
      uniV3Pool.slot0.returns({
        ...DUMB_SLOT,
        ...{
          observationIndex: mockObservationIndex,
          observationCardinality: UNIV3_MAX_CARDINALITY,
        },
      });
      await volOracle.initPool(uniV3Pool.address);
      await expect(volOracle.initPool(uniV3Pool.address)).to.be.revertedWith("Pool already initialized");
    });

    it("initializes a pool correctly", async () => {
      const mockObservationIndex = 10;
      uniV3Pool.slot0.returns({
        ...DUMB_SLOT,
        ...{
          observationIndex: mockObservationIndex,
          observationCardinality: UNIV3_MAX_CARDINALITY,
        },
      });
      for (let i = 0; i < mockObservationIndex - 1; i++) {
        uniV3Pool.observations.whenCalledWith(i).returns(DUMB_OBSERVATION);
      }
      const ts = 1000;
      const tickCumulative = 999;
      uniV3Pool.observations
        .whenCalledWith(mockObservationIndex)
        .returns({ ...DUMB_OBSERVATION, ...{ blockTimestamp: ts, tickCumulative: tickCumulative } });
      await volOracle.initPool(uniV3Pool.address);
      const latestBlock = await ethers.provider.getBlock("latest");
      const oracleState = await volOracle.oracleStates(uniV3Pool.address);
      expect(oracleState.observationIndex).to.equal(0);
      expect(oracleState.lastObservationIndex).to.equal(mockObservationIndex);
      expect(oracleState.lastBlockTimestamp).to.equal(latestBlock.timestamp);
      const observation = await volOracle.getObservation(uniV3Pool.address, 0);
      expect(observation.blockTimestamp).to.equal(ts);
      expect(observation.tickCumulative).to.equal(tickCumulative);
      expect(observation.tickSquareCumulative).to.equal(0);
    });
  });

  describe("Fetch Index", () => {
    const observationCardinality = 1005;
    const mockObservationIndex0 = 10;
    const firstTs = 1000;
    const firstTickCumulative = 999;

    beforeEach("Initialize Uni Pool", async () => {
      uniV3Pool.slot0.returns({
        ...DUMB_SLOT,
        ...{
          observationIndex: mockObservationIndex0,
          observationCardinality: observationCardinality,
        },
      });
      for (let i = 0; i < mockObservationIndex0; i++) {
        uniV3Pool.observations.whenCalledWith(i).returns(DUMB_OBSERVATION);
      }

      uniV3Pool.observations
        .whenCalledWith(mockObservationIndex0)
        .returns({ ...DUMB_OBSERVATION, ...{ blockTimestamp: firstTs, tickCumulative: firstTickCumulative } });
      await volOracle.initPool(uniV3Pool.address);
    });

    it("fetch indexes correctly when the pool observation is larger than last observation", async () => {
      const mockObservationIndex1 = observationCardinality + 1;
      uniV3Pool.slot0.returns({
        ...DUMB_SLOT,
        ...{
          observationIndex: mockObservationIndex1,
          observationCardinality: observationCardinality,
        },
      });

      const [startIndex, endIndex] = await volOracle.fetchIntermediateIndexes(uniV3Pool.address);
      expect(startIndex).to.equal(mockObservationIndex0 + 1);
      expect(endIndex).to.equal(mockObservationIndex1);
    });

    it("fetch indexes correctly when the pool observation is smaller than last observation", async () => {
      const mockObservationIndex1 = observationCardinality + 1;
      uniV3Pool.slot0.returns({
        ...DUMB_SLOT,
        ...{
          observationIndex: mockObservationIndex1 % observationCardinality,
          observationCardinality: observationCardinality,
        },
      });

      const [startIndex, endIndex] = await volOracle.fetchIntermediateIndexes(uniV3Pool.address);
      expect(startIndex).to.equal(mockObservationIndex0 + 1);
      expect(endIndex).to.equal(mockObservationIndex1);
    });
  });
});
