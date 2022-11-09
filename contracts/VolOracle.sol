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
        (, , uint16 latestPoolObservationIndex, uint16 poolCardinality, , , ) = IUniswapV3Pool(_pool).slot0();
        uint256 lastObservationIndex = oracleStates[_pool].lastObservationIndex;
        // TODO: we are assuming the oracle won't be down for a long time (>7 days here)
        // both inclusive
        if (latestPoolObservationIndex > lastObservationIndex)
            return (lastObservationIndex + 1, latestPoolObservationIndex);
        return (lastObservationIndex + 1, latestPoolObservationIndex + poolCardinality);
    }

    function fillInObservations(address _pool) external {
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
            VolObservation memory prevObservation = volOracleState.observations[volObservationIndex];
            uint32 timeDelta = blockTimestamp - prevObservation.blockTimestamp;
            int56 tickDelta = tickCumulative - prevObservation.tickCumulative;
            uint112 tickSquareDelta = uint112(int112((tickDelta / int56(uint56(timeDelta))) ** 2));
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
}
