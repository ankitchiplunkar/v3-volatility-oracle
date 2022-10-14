// SPDX-License-Identifier: UNLICENSED
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
        // whether or not the observation is initialized
        bool initialized;
    }


    // observation size
    // stores 30 days of data (with some buffer)
    uint256 public constant OBSERVATION_SIZE = 345600;
    uint256 public constant UNIV3_MAX_CARDINALITY = 65535;

    struct VolOracleState {
        // @dev Stores Observation arrays for each pool
        // TODO: can we use constant here
        VolObservation[] observations;
        // @dev Stores lastBlockTimestamp when the observation was initialized for the pool
        uint256 lastBlockTimestamp;
        uint256 lastObservationIndex;
    }

    // @dev Stores Observation arrays for each pool
    mapping(address => VolOracleState) public oracleStates;


    function initPool(address _pool) external {
        require(oracleStates[_pool].observations.length == 0, "Pool already initialized");
        // only initialize pools which have max cardinality
        (, , uint16 observationIndex, uint16 observationCardinality, , , ) = IUniswapV3Pool(_pool).slot0();
        require(
            observationCardinality == UNIV3_MAX_CARDINALITY,
            "Pool not at max cardinality"
        );
        // TODO: if pool is not at max cardinality then grow it
        // initializing the pool to max size
        oracleStates[_pool] = VolOracleState(
            // TODO: can we initialize storage array here?
            new VolObservation[](OBSERVATION_SIZE),
            block.timestamp,
            observationIndex
        );
    }

    // returns the start and end indexes for filling intermediate values
    function fetchIntermediateIndexes(address _pool) public view returns (uint256 startIndex, uint256 endIndex) {
        (, , uint16 latestPoolObservationIndex, , , , ) = IUniswapV3Pool(_pool).slot0();
        uint256 lastObservationIndex = oracleStates[_pool].lastObservationIndex;
        if (latestPoolObservationIndex > lastObservationIndex)
            return (lastObservationIndex + 1, latestPoolObservationIndex);
        return (latestPoolObservationIndex + UNIV3_MAX_CARDINALITY, lastObservationIndex);
    }
}
