import { FakeContract, smock } from "@defi-wonderland/smock";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
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
    sqrtPriceX96: 1,
    tick: 1,
    observationIndex: 0,
    observationCardinality: 100,
    observationCardinalityNext: 100,
    feeProtocol: 1,
    unlocked: false,
  };

  const DUMB_OBSERVATION = {
    blockTimestamp: 1,
    tickCumulative: 1,
    secondsPerLiquidityCumulativeX128: 1,
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

  describe("Fetch Index", async () => {
    const observationCardinality = 1000;
    const mockObservationIndex0 = 700;
    const firstTickCumulative = 1000;

    beforeEach("Prepare Uni Pool and Vol Oracle", async () => {
      uniV3Pool.slot0.returns({
        ...DUMB_SLOT,
        ...{
          observationIndex: mockObservationIndex0,
          observationCardinality: observationCardinality,
        },
      });

      const latestBlock = await ethers.provider.getBlock("latest");
      const firstTs = latestBlock.timestamp;

      for (let i = 0; i < mockObservationIndex0; i++) {
        uniV3Pool.observations.whenCalledWith(i).returns(DUMB_OBSERVATION);
      }

      uniV3Pool.observations
        .whenCalledWith(mockObservationIndex0)
        .returns({ ...DUMB_OBSERVATION, ...{ blockTimestamp: firstTs, tickCumulative: firstTickCumulative } });

      await volOracle.initPool(uniV3Pool.address);
    });

    it("fetches indexes correctly when the pool observations grow", async () => {
      const mockObservationIndex1 = mockObservationIndex0 + 5;
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

    it("fetches indexes correctly when the pool observations grow and override", async () => {
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

    it("fetches index correctly when the whole observation array is completely overriden", async () => {
      const mockObservationIndex1 = mockObservationIndex0 + 5;
      uniV3Pool.slot0.returns({
        ...DUMB_SLOT,
        ...{
          observationIndex: mockObservationIndex1 % observationCardinality,
          observationCardinality: observationCardinality,
        },
      });

      // the oldest observation, the timestamp should be bigger than the last
      uniV3Pool.observations.whenCalledWith(mockObservationIndex1 + 1).returns({
        ...DUMB_OBSERVATION,
        ...{
          blockTimestamp: (await volOracle.oracleStates(uniV3Pool.address)).lastBlockTimestamp.toNumber() + 1,
        },
      });

      const [startIndex, endIndex] = await volOracle.fetchIntermediateIndexes(uniV3Pool.address);
      expect(startIndex).to.equal(mockObservationIndex1 + 1);
      expect(endIndex).to.equal(mockObservationIndex1 + observationCardinality);
    });

    it("fetches index correctly when the observation array has not grown", async () => {
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
  });

  describe("Fill in observations", function () {
    const observationCardinality = 1000;
    const mockObservationIndex0 = 700;
    const startTickCumulative = 10000;
    let startTs: number;

    /**
     * fake slot0 and observations return for uniswap. ≈
     * @param firstIndex the index of the first observation to be mocked out
     * @param length the length of the observations to be mocked out
     * @param firstTs the timestamp of the first mocked out observation, increment ts by 1 per observation
     * @param tickCumulativeData optional, if not specified, filled with tick = 1
     */
    async function fakeObservations(
      firstIndex: number,
      length: number,
      firstTs: number,
      tickCumulativeData?: number[],
    ) {
      uniV3Pool.slot0.returns({
        ...DUMB_SLOT,
        ...{
          observationIndex: (firstIndex + length - 1) % observationCardinality,
          observationCardinality: observationCardinality,
        },
      });

      for (let i = 0; i < length; i++) {
        const ts = firstTs + i;
        const tickCumulative =
          typeof tickCumulativeData !== "undefined" ? tickCumulativeData[i] : startTickCumulative + ts - startTs;

        uniV3Pool.observations
          .whenCalledWith((firstIndex + i) % observationCardinality)
          .returns({ ...DUMB_OBSERVATION, ...{ blockTimestamp: ts, tickCumulative: tickCumulative } });
      }
    }

    beforeEach("Prepare Uni Pool and Vol Oracle", async function () {
      if (this.currentTest?.title == "should return error if the pool is not initialized") return;

      startTs = (await getLatestTimestamp()) - mockObservationIndex0;

      await fakeObservations(0, mockObservationIndex0 + 1, startTs);
      await volOracle.initPool(uniV3Pool.address);
    });

    it("should return error if the pool is not initialized", async function () {
      await expect(volOracle.fillInObservations(uniV3Pool.address)).to.be.revertedWith("Pool not initialized");
    });

    it("fills in observations correctly when uni observations grow but not override", async function () {
      await mine(observationCardinality);

      const observationGrowth = 2;
      const tsOffset = mockObservationIndex0 + 200;
      await fakeObservations(mockObservationIndex0 + 1, observationGrowth, startTs + tsOffset);

      uniV3Pool.observations
        .whenCalledWith(mockObservationIndex0 + observationGrowth + 1)
        .returns({ ...DUMB_OBSERVATION, ...{ initialized: false } });

      await volOracle.fillInObservations(uniV3Pool.address);

      const oracleState = await volOracle.oracleStates(uniV3Pool.address);
      expect(oracleState.lastBlockTimestamp).to.equal(await getLatestTimestamp());
      expect(oracleState.lastObservationIndex).to.equal(mockObservationIndex0 + observationGrowth);
      expect(oracleState.observationIndex).to.equal(observationGrowth);

      const observation0 = await volOracle.getObservation(uniV3Pool.address, 1);
      expect(observation0.blockTimestamp).to.equal(startTs + tsOffset);
      expect(observation0.tickCumulative).to.equal(startTickCumulative + tsOffset);
      expect(observation0.tickSquareCumulative).to.equal(tsOffset - mockObservationIndex0);

      const observation1 = await volOracle.getObservation(uniV3Pool.address, 2);
      expect(observation1.blockTimestamp).to.equal(startTs + tsOffset + 1);
      expect(observation1.tickCumulative).to.equal(startTickCumulative + tsOffset + 1);
      expect(observation1.tickSquareCumulative).to.equal(tsOffset + 1 - mockObservationIndex0);
    });

    it("fills in observations correctly when uni observations grow and override", async function () {
      await mine(observationCardinality * 2); // fast forward long enough so that we have enough ts range for the array

      const observationGrowth = observationCardinality - mockObservationIndex0 + 12;
      const tsOffset = mockObservationIndex0 + 200;
      await fakeObservations(mockObservationIndex0 + 1, observationGrowth, startTs + tsOffset);

      await volOracle.fillInObservations(uniV3Pool.address);

      const oracleState = await volOracle.oracleStates(uniV3Pool.address);
      expect(oracleState.lastBlockTimestamp).to.equal(await getLatestTimestamp());
      expect(oracleState.lastObservationIndex).to.equal(
        (mockObservationIndex0 + observationGrowth) % observationCardinality,
      );
      expect(oracleState.observationIndex).to.equal(observationGrowth);

      const lastObservation = await volOracle.getObservation(uniV3Pool.address, observationGrowth);
      expect(lastObservation.blockTimestamp).to.equal(startTs + tsOffset + observationGrowth - 1);
      expect(lastObservation.tickCumulative).to.equal(startTickCumulative + tsOffset + observationGrowth - 1);
      expect(lastObservation.tickSquareCumulative).to.equal(tsOffset + observationGrowth - 1 - mockObservationIndex0);
    });

    // TODO: currently this test can't pass due to out of gas. We either need to optmize gas or set upper limit on per fill operation
    xit("fills in observations correctly when uni observations are fully overridden", async function () {
      await mine(observationCardinality * 2); // fast forward long enough so that we have enough ts range for the array

      const observationGrowth = observationCardinality + 5;
      const tsOffset = mockObservationIndex0 + 200;
      await fakeObservations(mockObservationIndex0 + 1, observationGrowth, startTs + tsOffset);

      await volOracle.fillInObservations(uniV3Pool.address);

      const oracleState = await volOracle.oracleStates(uniV3Pool.address);
      expect(oracleState.lastBlockTimestamp).to.equal(await getLatestTimestamp());
      expect(oracleState.lastObservationIndex).to.equal(
        (mockObservationIndex0 + observationGrowth) % observationCardinality,
      );
      expect(oracleState.observationIndex).to.equal(observationCardinality);

      const lastObservation = await volOracle.getObservation(uniV3Pool.address, observationCardinality);
      expect(lastObservation.blockTimestamp).to.equal(startTs + tsOffset + observationGrowth - 1);
      expect(lastObservation.tickCumulative).to.equal(startTickCumulative + tsOffset + observationGrowth - 1);
      expect(lastObservation.tickSquareCumulative).to.equal(tsOffset + observationGrowth - 1 - mockObservationIndex0);
    });

    it("should not change state if the uni array stays the same", async function () {
      await mine(10);

      uniV3Pool.observations
        .whenCalledWith(mockObservationIndex0 + 1)
        .returns({ ...DUMB_OBSERVATION, ...{ initialized: false } });

      await volOracle.fillInObservations(uniV3Pool.address);
      const oracleState = await volOracle.oracleStates(uniV3Pool.address);
      expect(oracleState.lastBlockTimestamp).to.equal(await getLatestTimestamp());
      expect(oracleState.lastObservationIndex).to.equal(mockObservationIndex0);
      expect(oracleState.observationIndex).to.equal(0);
    });

    it("calculate the tickSquareCumulative correctly when the price is only going down", async function () {
      await mine(observationCardinality);

      const observationGrowth: number = 100;
      const tsOffset: number = mockObservationIndex0 + 200;

      const tickCumulativeData: number[] = new Array(observationGrowth);

      for (let i = 0; i < observationGrowth; i++) {
        tickCumulativeData[i] = startTickCumulative + mockObservationIndex0 - (tsOffset - mockObservationIndex0 + i);
      }
      await fakeObservations(mockObservationIndex0 + 1, observationGrowth, startTs + tsOffset, tickCumulativeData);

      uniV3Pool.observations
        .whenCalledWith(mockObservationIndex0 + observationGrowth + 1)
        .returns({ ...DUMB_OBSERVATION, ...{ initialized: false } });

      await volOracle.fillInObservations(uniV3Pool.address);

      const oracleState = await volOracle.oracleStates(uniV3Pool.address);
      expect(oracleState.lastBlockTimestamp).to.equal(await getLatestTimestamp());
      expect(oracleState.lastObservationIndex).to.equal(mockObservationIndex0 + observationGrowth);
      expect(oracleState.observationIndex).to.equal(observationGrowth);

      const observation = await volOracle.getObservation(uniV3Pool.address, observationGrowth);
      console.log(observation);
      expect(observation.blockTimestamp).to.equal(startTs + tsOffset + observationGrowth - 1);
      expect(observation.tickCumulative).to.equal(
        startTickCumulative + mockObservationIndex0 - (tsOffset - mockObservationIndex0 + observationGrowth - 1),
      );
      expect(observation.tickSquareCumulative).to.equal(tsOffset - mockObservationIndex0 + observationGrowth - 1);
    });

    it("calculate the tickSquareCumulative correctly when the price flunctuates", async function () {
      await mine(observationCardinality);

      const observationGrowth: number = 4;
      const tsOffset: number = mockObservationIndex0 + 100;

      // tick [1, -2, 3, -4]
      const tickCumulativeData: number[] = new Array(4);
      tickCumulativeData[0] = startTickCumulative + tsOffset;
      tickCumulativeData[1] = tickCumulativeData[0] - 2;
      tickCumulativeData[2] = tickCumulativeData[1] + 3;
      tickCumulativeData[3] = tickCumulativeData[2] - 4;

      await fakeObservations(mockObservationIndex0 + 1, observationGrowth, startTs + tsOffset, tickCumulativeData);

      uniV3Pool.observations
        .whenCalledWith(mockObservationIndex0 + observationGrowth + 1)
        .returns({ ...DUMB_OBSERVATION, ...{ initialized: false } });

      await volOracle.fillInObservations(uniV3Pool.address);

      const oracleState = await volOracle.oracleStates(uniV3Pool.address);
      expect(oracleState.lastBlockTimestamp).to.equal(await getLatestTimestamp());
      expect(oracleState.lastObservationIndex).to.equal(mockObservationIndex0 + observationGrowth);
      expect(oracleState.observationIndex).to.equal(observationGrowth);

      const observation = await volOracle.getObservation(uniV3Pool.address, observationGrowth);
      expect(observation.blockTimestamp).to.equal(startTs + tsOffset + observationGrowth - 1);
      expect(observation.tickCumulative).to.equal(tickCumulativeData[3]);
      // (tsOffset - mockObservationIndex0) * 1 + 4 + 9 + 16
      expect(observation.tickSquareCumulative).to.equal((tsOffset - mockObservationIndex0) * 1 + 4 + 9 + 16);
    });
  });
});

async function getLatestTimestamp() {
  const latestBlock = await ethers.provider.getBlock("latest");
  return latestBlock.timestamp;
}
