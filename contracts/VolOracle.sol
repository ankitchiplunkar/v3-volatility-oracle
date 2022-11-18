// SPDX-License-Identifier
pragma solidity >=0.8.4;

import { IUniswapV3Pool } from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import { VolOracleLib } from "./VolOracleLib.sol";

contract VolOracle {
    using VolOracleLib for VolOracleLib.VolOracleState;

    // observation size
    // stores 30 days of data (with some buffer)
    uint256 public constant UNIV3_MAX_CARDINALITY = 65535;
    uint256 public constant UNIV3_MIN_CARDINALITY = 1000;

    // the largest number of observations we can fill at one time, this depends on the gas consumption
    uint256 public maxFill;

    // @dev Stores Observation arrays for each pool
    mapping(address => VolOracleLib.VolOracleState) public oracleStates;

    constructor(uint256 _maxFill) {
        maxFill = _maxFill;
    }

    function getObservationSize(address _pool) public view returns (uint256 observationSize) {
        return oracleStates[_pool].observations.length;
    }

    function getObservation(address _pool, uint256 id) public view returns (VolOracleLib.VolObservation memory) {
        VolOracleLib.VolObservation memory observation = oracleStates[_pool].observations[id];
        return observation;
    }

    function initPool(address _pool) external {
        require(oracleStates[_pool].initialized == false, "Pool already initialized");
        // only initialize pools which have max cardinality
        IUniswapV3Pool uniPool = IUniswapV3Pool(_pool);
        (, , uint16 observationIndex, uint16 observationCardinality, , , ) = uniPool.slot0();
        require(observationCardinality >= UNIV3_MIN_CARDINALITY, "Pool not at min cardinality");
        // TODO: if pool is not at max cardinality then grow it
        // initializing the pool to max size
        VolOracleLib.VolOracleState storage oracleState = oracleStates[_pool];
        (uint32 blockTimestamp, int56 tickCumulative, , ) = uniPool.observations(observationIndex);
        // set the tickSquareCumulative to 0 during initialization

        oracleState.observations[0] = VolOracleLib.VolObservation(blockTimestamp, tickCumulative, 0);

        oracleState.lastBlockTimestamp = blockTimestamp;
        oracleState.lastCheckedUniswapObservationIndex = observationIndex;
        oracleState.observationIndex = 0;
        oracleState.initialized = true;
    }

    // returns the start and end indexes for filling intermediate values
    function fetchIntermediateIndexes(address _pool) public view returns (uint256 startIndex, uint256 endIndex) {
        IUniswapV3Pool uniPool = IUniswapV3Pool(_pool);
        (, , uint16 latestPoolObservationIndex, uint16 poolCardinality, , , ) = uniPool.slot0();

        uint256 oldestObservationIndex = (latestPoolObservationIndex + 1) % poolCardinality;

        (uint32 oldestObservationTs, , , bool initialized) = uniPool.observations(oldestObservationIndex);

        // The next index might not be initialized if the cardinality is in the process of increasing
        // In this case the oldest observation is always in index 0
        if (!initialized) {
            oldestObservationIndex = 0;
            (oldestObservationTs, , , ) = uniPool.observations(0);
        }

        VolOracleLib.VolOracleState storage volOracleState = oracleStates[_pool];

        // if the uni pool has overriden the whole array as oracle is down for too long, directly start from the
        // earliest available
        if (initialized && volOracleState.lastBlockTimestamp < oldestObservationTs) {
            startIndex = oldestObservationIndex;
            endIndex = latestPoolObservationIndex + poolCardinality;
        } else {
            startIndex = volOracleState.lastCheckedUniswapObservationIndex + 1;
            // both inclusive
            // stay the same
            if (latestPoolObservationIndex >= volOracleState.lastCheckedUniswapObservationIndex) {
                endIndex = latestPoolObservationIndex;
            } else {
                endIndex = latestPoolObservationIndex + poolCardinality;
            }
        }
    }

    function fillInObservations(address _pool) external {
        require(oracleStates[_pool].initialized == true, "Pool not initialized");

        (uint256 startIndex, uint256 endIndex) = fetchIntermediateIndexes(_pool);

        IUniswapV3Pool uniPool = IUniswapV3Pool(_pool);
        (, , , uint16 poolCardinality, , , ) = uniPool.slot0();
        VolOracleLib.VolOracleState storage volOracleState = oracleStates[_pool];
        uint256 volObservationIndex = volOracleState.observationIndex;
        // overwriting endIndex to be batch size
        if (endIndex > startIndex) {
            if ((endIndex - startIndex) > maxFill) {
                endIndex = startIndex + maxFill - 1;
            }
        }
        for (uint256 poolObservationIndex = startIndex; poolObservationIndex <= endIndex; poolObservationIndex++) {
            (uint32 blockTimestamp, int56 tickCumulative, , bool initialized) = uniPool.observations(
                poolObservationIndex % poolCardinality
            );
            // this observation has not been initialized, probably due to the increase of cardinality
            if (!initialized) continue;
            VolOracleLib.VolObservation storage prevObservation = volOracleState.observations[volObservationIndex];

            uint32 timeDelta = blockTimestamp - prevObservation.blockTimestamp;
            int56 tickDelta = tickCumulative - prevObservation.tickCumulative;
            uint112 tickSquareDelta = uint112(int112((tickDelta / int56(uint56(timeDelta)))**2)) * timeDelta;

            volObservationIndex = (volObservationIndex + 1) % VolOracleLib.OBSERVATION_SIZE;
            volOracleState.observations[volObservationIndex] = VolOracleLib.VolObservation(
                blockTimestamp,
                tickCumulative,
                tickSquareDelta + prevObservation.tickSquareCumulative
            );
        }
        (uint32 lastBlockTimestamp, , , ) = uniPool.observations(endIndex % poolCardinality);
        volOracleState.observationIndex = volObservationIndex;

        volOracleState.lastBlockTimestamp = uint256(lastBlockTimestamp);
        volOracleState.lastCheckedUniswapObservationIndex = endIndex % poolCardinality;
    }

    // @dev get the standdevation given specified days range from now
    function getVol(address _pool, uint32 _daysToNow) public view returns (uint256 standardDeviation) {
        uint32 target = uint32(block.timestamp) - _daysToNow * uint32(1 days);

        return oracleStates[_pool].calculateVol(target);
    }
}
