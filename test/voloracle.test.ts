import { FakeContract, smock } from "@defi-wonderland/smock";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { abi as POOL_ABI } from "@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json";
import chai from "chai";
import { ethers } from "hardhat";

import { IUniswapV3Pool } from "../src/types/@uniswap/v3-core/contracts/interfaces";
import { VolOracle } from "../src/types/contracts";
import { VolOracle__factory } from "../src/types/factories/contracts";
import {
  DUMB_OBSERVATION,
  DUMB_SLOT,
  checkResult,
  fakeObservationInitializationAndGrowth,
  fakeObservations,
  getLatestTimestamp,
} from "./helper";

chai.use(smock.matchers);
const { expect } = chai;

describe("Vol Oracle tests", () => {
  let volOracle: VolOracle;
  let deployer: SignerWithAddress;
  let uniV3Pool: FakeContract<IUniswapV3Pool>;
  let volOracleFactory: VolOracle__factory;
  const OBSERVATION_SIZE = 345600;
  const UNIV3_MAX_CARDINALITY = 65535;
  const maxFill = 500;

  beforeEach("deploy contracts", async () => {
    [deployer] = await ethers.getSigners();
    volOracleFactory = <VolOracle__factory>await ethers.getContractFactory("VolOracle");
    volOracle = await volOracleFactory.connect(deployer).deploy(maxFill);
    uniV3Pool = await smock.fake(POOL_ABI);
  });

  it("tests constants", async () => {
    expect(await volOracle.OBSERVATION_SIZE()).to.equal(OBSERVATION_SIZE);
    expect(await volOracle.UNIV3_MAX_CARDINALITY()).to.equal(UNIV3_MAX_CARDINALITY);
    expect(await volOracle.maxFill()).to.equal(maxFill);
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
      const oracleState = await volOracle.oracleStates(uniV3Pool.address);
      expect(oracleState.observationIndex).to.equal(0);
      expect(oracleState.lastBlockTimestamp).to.equal(ts);
      expect(oracleState.lastCheckedUniswapObservationIndex).to.equal(mockObservationIndex);
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

    beforeEach("Prepare Uni Pool and Vol Oracle", async function () {
      startTs = (await getLatestTimestamp()) - mockObservationIndex0;
    });

    async function callFakeObservations(
      firstIndex: number,
      length: number,
      firstTs: number,
      tickCumulativeData?: number[],
    ) {
      await fakeObservations(
        uniV3Pool,
        observationCardinality,
        startTs,
        startTickCumulative,
        firstIndex,
        length,
        firstTs,
        tickCumulativeData,
      );
    }

    it("should return error if the pool is not initialized", async function () {
      await expect(volOracle.fillInObservations(uniV3Pool.address)).to.be.revertedWith("Pool not initialized");
    });

    it("fills in observations correctly when uni observations grow but not override", async function () {
      const observationGrowth = 2;
      const tsGap = 200;

      await fakeObservationInitializationAndGrowth(
        uniV3Pool,
        volOracle,
        mockObservationIndex0,
        observationGrowth,
        1,
        startTs,
        tsGap,
      );

      await volOracle.fillInObservations(uniV3Pool.address);

      await checkResult(uniV3Pool, volOracle, mockObservationIndex0, observationGrowth, 1, startTs, tsGap);
    });

    it("fills in observations correctly when uni observations grow and override", async function () {
      const observationGrowth = observationCardinality - mockObservationIndex0 + 12;
      const tsGap = 200;
      await fakeObservationInitializationAndGrowth(
        uniV3Pool,
        volOracle,
        mockObservationIndex0,
        observationGrowth,
        1,
        startTs,
        tsGap,
      );

      await volOracle.fillInObservations(uniV3Pool.address);

      await checkResult(uniV3Pool, volOracle, mockObservationIndex0, observationGrowth, 1, startTs, tsGap);
    });

    // TODO: currently this test can't pass due to out of gas. We either need to optmize gas or set upper limit on per fill operation
    xit("fills in observations correctly when uni observations are fully overridden", async function () {
      await mine(observationCardinality * 2); // fast forward long enough so that we have enough ts range for the array

      const observationGrowth = observationCardinality + 5;
      const tsOffset = mockObservationIndex0 + 200;
      await callFakeObservations(mockObservationIndex0 + 1, observationGrowth, startTs + tsOffset);

      await volOracle.fillInObservations(uniV3Pool.address);

      const oracleState = await volOracle.oracleStates(uniV3Pool.address);
      expect(oracleState.lastBlockTimestamp).to.equal(await getLatestTimestamp());
      expect(oracleState.lastCheckedUniswapObservationIndex).to.equal(
        (mockObservationIndex0 + observationGrowth) % observationCardinality,
      );
      expect(oracleState.observationIndex).to.equal(observationCardinality);

      const lastObservation = await volOracle.getObservation(uniV3Pool.address, observationCardinality);
      expect(lastObservation.blockTimestamp).to.equal(startTs + tsOffset + observationGrowth - 1);
      expect(lastObservation.tickCumulative).to.equal(startTickCumulative + tsOffset + observationGrowth - 1);
      expect(lastObservation.tickSquareCumulative).to.equal(tsOffset + observationGrowth - 1 - mockObservationIndex0);
    });

    it("should not change state if the uni array stays the same", async function () {
      const observationGrowth = 0;
      const tsGap = 200;
      await fakeObservationInitializationAndGrowth(
        uniV3Pool,
        volOracle,
        mockObservationIndex0,
        observationGrowth,
        1,
        startTs,
        tsGap,
      );

      await volOracle.fillInObservations(uniV3Pool.address);

      await checkResult(uniV3Pool, volOracle, mockObservationIndex0, observationGrowth, 1, startTs, tsGap);
    });

    it("calculate the tickSquareCumulative correctly when the price is only going down", async function () {
      const observationGrowth = 2;
      const tsGap = 200;

      await fakeObservationInitializationAndGrowth(
        uniV3Pool,
        volOracle,
        mockObservationIndex0,
        observationGrowth,
        -1,
        startTs,
        tsGap,
      );

      await volOracle.fillInObservations(uniV3Pool.address);

      await checkResult(uniV3Pool, volOracle, mockObservationIndex0, observationGrowth, -1, startTs, tsGap);
    });

    it("calculate the tickSquareCumulative correctly when the price flunctuates", async function () {
      const observationGrowth: number = 4;
      const tsGap = 100;

      // tick [1, -2, 3, -4]
      const tickData = new Array(mockObservationIndex0 + 1 + observationGrowth);
      for (let i = 0; i <= mockObservationIndex0; i++) {
        tickData[i] = 1;
      }
      tickData[mockObservationIndex0 + 1] = 1;
      tickData[mockObservationIndex0 + 2] = -2;
      tickData[mockObservationIndex0 + 3] = 3;
      tickData[mockObservationIndex0 + 4] = -4;

      await fakeObservationInitializationAndGrowth(
        uniV3Pool,
        volOracle,
        mockObservationIndex0,
        observationGrowth,
        tickData,
        startTs,
        tsGap,
      );

      await volOracle.fillInObservations(uniV3Pool.address);

      await checkResult(uniV3Pool, volOracle, mockObservationIndex0, observationGrowth, tickData, startTs, tsGap);
    });
  });

  describe("Fill observations in batches", function () {
    const mockObservationIndex0 = 700;
    const smallMaxFill = 10;
    let startTs: number;

    beforeEach("Prepare Uni Pool and Vol Oracle", async function () {
      volOracle = await volOracleFactory.connect(deployer).deploy(smallMaxFill);
      startTs = (await getLatestTimestamp()) - mockObservationIndex0;
    });

    it("fills in first observations batch", async function () {
      const observationGrowth = 20;
      const tsGap = 200;

      await fakeObservationInitializationAndGrowth(
        uniV3Pool,
        volOracle,
        mockObservationIndex0,
        observationGrowth,
        1,
        startTs,
        tsGap,
      );

      await volOracle.fillInObservations(uniV3Pool.address);

      await checkResult(uniV3Pool, volOracle, mockObservationIndex0, smallMaxFill, 1, startTs, tsGap);
    });

    it("fills in observations for multiple batches", async function () {
      const observationGrowth = 30;
      const tsGap = 200;

      await fakeObservationInitializationAndGrowth(
        uniV3Pool,
        volOracle,
        mockObservationIndex0,
        observationGrowth,
        1,
        startTs,
        tsGap,
      );

      // fills first batch
      await volOracle.fillInObservations(uniV3Pool.address);
      await checkResult(uniV3Pool, volOracle, mockObservationIndex0, smallMaxFill, 1, startTs, tsGap);
      // fills second batch
      await volOracle.fillInObservations(uniV3Pool.address);
      await checkResult(uniV3Pool, volOracle, mockObservationIndex0, 2 * smallMaxFill, 1, startTs, tsGap);
      // fills third batch
      await volOracle.fillInObservations(uniV3Pool.address);
      await checkResult(uniV3Pool, volOracle, mockObservationIndex0, 3 * smallMaxFill, 1, startTs, tsGap);
    });
  });
});
