import { FakeContract } from "@defi-wonderland/smock";
import { ethers } from "hardhat";

import { IUniswapV3Pool } from "../src/types/@uniswap/v3-core/contracts/interfaces";

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

export async function getLatestTimestamp() {
  const latestBlock = await ethers.provider.getBlock("latest");
  return latestBlock.timestamp;
}
