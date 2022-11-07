// SPDX-License-Identifier
pragma solidity >=0.8.4;

import { IUniswapV3Pool } from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

contract VolOracle {
    // constructor
    // initializes a uniswap

    struct VolObservation {
        // the block timestamp of the observation
        uint32 blockTimestamp;
        // the tick accumulator, i.e. tick * time elapsed since the pool was first initialized
        int56 tickCumulative;
        // the tick square accumulator, i.e. tick * tick * time elapsed since the oracle was first initialized
        uint112 tickSquareCumulative;
    }

    // observation size
    // stores 30 days of data (with some buffer)
    uint256 public constant OBSERVATION_SIZE = 345600;
    uint256 public constant UNIV3_MAX_CARDINALITY = 65535;
    uint256 public constant UNIV3_MIN_CARDINALITY = 1000;
    // the largest number of observations we can fill at one time, this depends on the gas consumption
    //  uint256 public const MAX_FILL = 400;

    struct VolOracleState {
        // @dev Stores Observation arrays for each pool
        // TODO: can we use constant here
        VolObservation[345600] observations;
        // @dev Stores lastBlockTimestamp when the observation was initialized for the pool
        uint256 lastBlockTimestamp;
        // @dev last observation index in uniswap pool
        uint256 lastObservationIndex;
        // @dev observation index for volatility observations
        uint256 observationIndex;
    }

    // @dev Stores Observation arrays for each pool
    mapping(address => VolOracleState) public oracleStates;

    function getObservationSize(address _pool) public view returns (uint256 observationSize) {
        return oracleStates[_pool].observations.length;
    }

    function getObservation(address _pool, uint256 id) public view returns (VolObservation memory) {
        VolObservation memory observation = oracleStates[_pool].observations[id];
        return observation;
    }

    function initPool(address _pool) external {
        require(oracleStates[_pool].lastBlockTimestamp == 0, "Pool already initialized");
        // only initialize pools which have max cardinality
        IUniswapV3Pool uniPool = IUniswapV3Pool(_pool);
        (, , uint16 observationIndex, uint16 observationCardinality, , , ) = uniPool.slot0();
        require(observationCardinality >= UNIV3_MIN_CARDINALITY, "Pool not at min cardinality");
        // TODO: if pool is not at max cardinality then grow it
        // initializing the pool to max size
        VolOracleState storage oracleState = oracleStates[_pool];
        (uint32 blockTimestamp, int56 tickCumulative, , ) = uniPool.observations(observationIndex);
        // set the tickSquareCumulative to 0 during initialization
        oracleState.observations[0] = VolObservation(blockTimestamp, tickCumulative, 0);
        // TODO: should we use current blocktimestamp or the last observation timestamp from uni here

        oracleState.lastBlockTimestamp = block.timestamp;
        oracleState.lastObservationIndex = observationIndex;
        oracleState.observationIndex = 0;
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
            (oldestObservationTs, , , ) = uniPool.observations(0);
        }

        VolOracleState storage volOracleState = oracleStates[_pool];

        // if the uni pool has overriden the whole array as oracle is down for too long, directly start from the
        // earliest available
        if (initialized && volOracleState.lastBlockTimestamp < oldestObservationTs) {
            startIndex = oldestObservationIndex;
            endIndex = latestPoolObservationIndex + poolCardinality;
        } else {
            startIndex = volOracleState.lastObservationIndex + 1;
            // both inclusive
            // stay the same
            if (latestPoolObservationIndex >= volOracleState.lastObservationIndex) {
                endIndex = latestPoolObservationIndex;
            } else {
                endIndex = latestPoolObservationIndex + poolCardinality;
            }
        }
    }

    function fillInObservations(address _pool) external {
        require(oracleStates[_pool].lastBlockTimestamp > 0, "Pool not initialized");

        (uint256 startIndex, uint256 endIndex) = fetchIntermediateIndexes(_pool);

        IUniswapV3Pool uniPool = IUniswapV3Pool(_pool);
        (, , , uint16 poolCardinality, , , ) = uniPool.slot0();
        VolOracleState storage volOracleState = oracleStates[_pool];
        uint256 volObservationIndex = volOracleState.observationIndex;
        for (uint256 poolObservationIndex = startIndex; poolObservationIndex <= endIndex; poolObservationIndex++) {
            (uint32 blockTimestamp, int56 tickCumulative, , bool initialized) = uniPool.observations(
                poolObservationIndex % poolCardinality
            );
            // this observation has not been initialized, probably due to the increase of cardinality
            if (!initialized) continue;
            VolObservation storage prevObservation = volOracleState.observations[volObservationIndex];

            uint32 timeDelta = blockTimestamp - prevObservation.blockTimestamp;
            int56 tickDelta = tickCumulative - prevObservation.tickCumulative;
            uint112 tickSquareDelta = uint112(int112((tickDelta / int56(uint56(timeDelta)))**2)) * timeDelta;

            volObservationIndex = (volObservationIndex + 1) % OBSERVATION_SIZE;
            volOracleState.observations[volObservationIndex] = VolObservation(
                blockTimestamp,
                tickCumulative,
                tickSquareDelta + prevObservation.tickSquareCumulative
            );
        }

        volOracleState.observationIndex = volObservationIndex;
        volOracleState.lastObservationIndex = endIndex % poolCardinality;
        volOracleState.lastBlockTimestamp = block.timestamp;
    }

    function getObservationSize(address _pool) public view returns (uint256 observationSize) {
        return oracleStates[_pool].observations.length;
    }

    function getObservation(address _pool, uint256 _idx) public view returns (VolObservation memory) {
        return oracleStates[_pool].observations[_idx];
    }


    // @dev get the standdevation given specified days range from now
    function getVol(address _pool, uint32 _daysToNow) public view returns(uint256 standardDeviation) {
        uint32 target = uint32(block.timestamp) - _daysToNow * uint32(1 days);
        // binary search to start index.
        uint256 startIndex = getObservationIndexBeforeOrAtTarget(_pool, target);
        // TODO: edge case - 1st element of the array

        return calculateVol(_pool, startIndex);
    }

    // TODO: WIP
    // @dev calculate the standdevation from startIndex to endIndex
    function calculateVol(address _pool, uint256 startIndex) internal view returns(uint256 stanDeviation) {
        VolOracleState memory volOracleState = oracleStates[_pool];
        uint256 endIndex = volOracleState.observationIndex;
        VolObservation memory startObservation = volOracleState.observations[startIndex];
        VolObservation memory endObservation = volOracleState.observations[endIndex];
        uint256 tickSquareSum = endObservation.tickSquareCumulative - startObservation.tickSquareCumulative;
        uint256 timeEclapsed = uint256(endObservation.blockTimestamp - startObservation.blockTimestamp);
        uint256 tickAvg = uint256(uint56(endObservation.tickCumulative - startObservation.tickCumulative)) / timeEclapsed;
        uint256 stddev = (tickSquareSum - tickAvg * tickAvg * timeEclapsed) / timeEclapsed;
        return stddev;
    }

    // @dev get the obesrvation index right before or at the target timestamp, using binary search
    function getObservationIndexBeforeOrAtTarget(
        address _pool,
        uint32 _target
    ) private view returns(uint256 observationIndexAfterTarget) {
        VolOracleState memory volOracleState = oracleStates[_pool];
        uint256 l = (volOracleState.observationIndex + 1) % OBSERVATION_SIZE;
        uint256 r = l + OBSERVATION_SIZE - 1;
        uint256 idx;
        while (true) {
            idx = (l + r) / 2;

            VolObservation memory curObservation = volOracleState.observations[idx % OBSERVATION_SIZE];
            if (curObservation.blockTimestamp == 0) {
                // hasn't been initialized
                l = idx + 1;
                continue;
            }

            if (l == r) break;
            if (curObservation.blockTimestamp <= _target) {
                l = idx + 1;
            } else {
                r = idx - 1;
            }
        }

        l = l % OBSERVATION_SIZE;
        VolObservation memory observation = volOracleState.observations[l];
        if (observation.blockTimestamp <= _target) {
            return l;
        } else {
            return (l - 1 + OBSERVATION_SIZE) % OBSERVATION_SIZE;
        }
    }


}
