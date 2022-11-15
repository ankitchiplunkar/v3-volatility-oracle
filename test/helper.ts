import { FakeContract } from "@defi-wonderland/smock";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { ethers } from "hardhat";

import { IUniswapV3Pool } from "../src/types/@uniswap/v3-core/contracts/interfaces";
import { VolOracle } from "../src/types/contracts";

const { expect } = chai;

export const DUMB_SLOT = {
  sqrtPriceX96: 1,
  tick: 1,
  observationIndex: 0,
  observationCardinality: 100,
  observationCardinalityNext: 100,
  feeProtocol: 1,
  unlocked: false,
};

export const DUMB_OBSERVATION = {
  blockTimestamp: 1,
  tickCumulative: 1,
  secondsPerLiquidityCumulativeX128: 1,
  initialized: true,
};

const OBSERVATION_CARDINALITY = 1000;
const START_TICK_CUMULATIVE = 10000;

/**
 * fake slot0 and observations return for uniswap. ≈
 * @param firstIndex the index of the first observation to be mocked out
 * @param length the length of the observations to be mocked out
 * @param firstTs the timestamp of the first mocked out observation, increment ts by 1 per observation
 * @param tickCumulativeData optional, if not specified, filled with tick = 1
 */
export async function fakeObservations(
  uniV3Pool: FakeContract<IUniswapV3Pool>,
  observationCardinality: number,
  startTs: number,
  startTickCumulative: number,
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

/**
 * This function will fake the following actions in sequence:
 *    - fill in initial data for uni observation array
 *    - initialize volatility oracle,
 *    - grow the uni observation array
 * ts is also strictly ordered with 1 between each uni observation.
 * @param uniV3Pool uni pool
 * @param volOracle vol oracle
 * @param initialObservationIndex the observation index before initializing the vol oracle
 * @param observationGrowth the observation array growth after initializing the vol oracle
 * @param tickData can be number or array. every observation uses this number or the corresponding index in the array
 * @param startTs start timestamp before the uni observation 0
 * @param tsGap the ts gap before the initialObservationIndex observation and the next one
 */
export async function fakeObservationInitializationAndGrowth(
  uniV3Pool: FakeContract<IUniswapV3Pool>,
  volOracle: VolOracle,
  initialObservationIndex: number,
  observationGrowth: number,
  tickData: number | number[],
  startTs: number,
  tsGap: number,
) {
  // select a ts
  let ts = startTs;
  let tickCumulative = START_TICK_CUMULATIVE;
  // fill in the initial data for slot0 and observations
  uniV3Pool.slot0.returns({
    ...DUMB_SLOT,
    ...{
      observationIndex: initialObservationIndex,
      observationCardinality: OBSERVATION_CARDINALITY,
    },
  });

  for (let i = 0; i <= initialObservationIndex; i++, ts++) {
    if (typeof tickData === "number") {
      tickCumulative += tickData;
    } else {
      tickCumulative += tickData[i];
    }

    uniV3Pool.observations
      .whenCalledWith(i)
      .returns({ ...DUMB_OBSERVATION, ...{ blockTimestamp: ts, tickCumulative: tickCumulative } });
  }

  for (let i = initialObservationIndex + 1; i < OBSERVATION_CARDINALITY; ++i) {
    uniV3Pool.observations.whenCalledWith(i).returns({ ...DUMB_OBSERVATION, ...{ initialized: false } });
  }

  await time.setNextBlockTimestamp(ts);
  await volOracle.initPool(uniV3Pool.address);

  // mimic the growth of observations
  uniV3Pool.slot0.returns({
    ...DUMB_SLOT,
    ...{
      observationIndex: (initialObservationIndex + observationGrowth) % OBSERVATION_CARDINALITY,
      observationCardinality: OBSERVATION_CARDINALITY,
    },
  });

  ts = ts - 1 + tsGap;
  for (let i = initialObservationIndex + 1; i <= initialObservationIndex + observationGrowth; i++, ts++) {
    const tick = typeof tickData === "number" ? tickData : tickData[i];
    tickCumulative += i === initialObservationIndex + 1 ? tick * tsGap : tick;

    uniV3Pool.observations
      .whenCalledWith(i % OBSERVATION_CARDINALITY)
      .returns({ ...DUMB_OBSERVATION, ...{ blockTimestamp: ts, tickCumulative: tickCumulative } });
  }

  // increase the timestamp enough
  await time.increase(OBSERVATION_CARDINALITY * 3);
}

export async function getExpectedStates(
  initialObservationIndex: number,
  observationGrowth: number,
  tickData: number | number[],
  startTs: number,
  tsGap: number,
) {
  let firstTickCumulative;
  let lastTickCumulative;
  let lastTickSquareCumulative;

  let tickAccumulator = START_TICK_CUMULATIVE;
  let tickSquareAccumulator = 0;
  for (let i = 0; i <= initialObservationIndex + observationGrowth; i++) {
    const tick = typeof tickData === "number" ? tickData : tickData[i];
    if (i === initialObservationIndex + 1) {
      tickAccumulator += tick * tsGap;
      tickSquareAccumulator += tick * tick * tsGap;
    } else if (i > initialObservationIndex + 1) {
      tickAccumulator += tick;
      tickSquareAccumulator += tick * tick;
    } else {
      tickAccumulator += tick;
    }

    if (i === initialObservationIndex) {
      firstTickCumulative = tickAccumulator;
    }
    if (i === initialObservationIndex + observationGrowth) {
      lastTickCumulative = tickAccumulator;
      lastTickSquareCumulative = tickSquareAccumulator;
    }
  }

  const expectedReturn = {
    lastObservationIndex: (initialObservationIndex + observationGrowth) % OBSERVATION_CARDINALITY,
    observationIndex: observationGrowth,
    firstObservation: {
      blockTimestamp: startTs + initialObservationIndex,
      tickCummulative: firstTickCumulative,
      tickSquareCumulative: 0,
    },
    lastobservation: {
      blockTimestamp:
        observationGrowth === 0
          ? startTs + initialObservationIndex
          : startTs + initialObservationIndex + observationGrowth + tsGap - 1,
      tickCummulative: lastTickCumulative,
      tickSquareCumulative: lastTickSquareCumulative,
    },
  };

  return expectedReturn;
}

export async function checkResult(
  uniV3Pool: FakeContract<IUniswapV3Pool>,
  volOracle: VolOracle,
  initialObservationIndex: number,
  observationGrowth: number,
  tickData: number | number[],
  startTs: number,
  tsGap: number,
) {
  const expectedResult = await getExpectedStates(initialObservationIndex, observationGrowth, tickData, startTs, tsGap);

  const oracleState = await volOracle.oracleStates(uniV3Pool.address);

  expect(oracleState.lastObservationIndex).to.equal(expectedResult.lastObservationIndex);
  expect(oracleState.observationIndex).to.equal(expectedResult.observationIndex);

  const observation0 = await volOracle.getObservation(uniV3Pool.address, 0);
  expect(observation0.blockTimestamp).to.equal(expectedResult.firstObservation.blockTimestamp);
  expect(observation0.tickCumulative).to.equal(expectedResult.firstObservation.tickCummulative);
  expect(observation0.tickSquareCumulative).to.equal(expectedResult.firstObservation.tickSquareCumulative);

  const observation1 = await volOracle.getObservation(uniV3Pool.address, observationGrowth);
  expect(observation1.blockTimestamp).to.equal(expectedResult.lastobservation.blockTimestamp);
  expect(observation1.tickCumulative).to.equal(expectedResult.lastobservation.tickCummulative);
  expect(observation1.tickSquareCumulative).to.equal(expectedResult.lastobservation.tickSquareCumulative);
}

export async function getLatestTimestamp() {
  const latestBlock = await ethers.provider.getBlock("latest");
  return latestBlock.timestamp;
}
