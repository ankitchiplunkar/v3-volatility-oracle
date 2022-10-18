// SPDX-License-Identifier
pragma solidity >=0.8.4;

import { Observation } from "@uniswap/v3-core/contracts/libraries/Oracle.sol";
import { IUniswapV3Pool } from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

contract VolOracle {
    // constructor
    // initializes a uniswap

    // observation size
    // stores 30 days of data (with some buffer)
    uint256 public constant OBSERVATION_SIZE = 345600;
    uint256 public constant UNIV3_MAX_CARDINALITY = 65535;
    // @dev Stores Observation arrays for each pool
    mapping(address => Observation[OBSERVATION_SIZE]) public observations;
    // @dev Stores lastBlockTimestamp when the observation was initialized for the pool
    mapping(address => uint256) public lastBlockTimestamps;
    mapping(address => uint256) public lastObservationIndex;

    function initPool(address _pool) external {
        require(observations[_pool].length == 0, "Pool already initialized");
        // only initialize pools which have max cardinality
        require(
            IUniswapV3Pool(_pool).slot0.observationCardinality == UNIV3_MAX_CARDINALITY,
            "Pool not at max cardinality"
        );
        // TODO: if pool is not at max cardinality then grow it
        // initializing the pool to max size
        observations[_pool] = new Observation[](OBSERVATION_SIZE);
        lastBlockTimestamps[_pool] = block.timestamp;
        lastObservationIndex[_pool] = IUniswapV3Pool(_pool).slot0.observationIndex;
    }

    // returns the start and end indexes for filling intermediate values
    function fetchIntermediateIndexes(address _pool) public returns (uint256 startIndex, uint256 endIndex) {
        latestPoolObservationIndex = IUniswapV3Pool(_pool).slot0.observationIndex;
        lastObservationIndex = lastObservationIndex[_pool];
        if (latestPoolObservationIndex > lastObservationIndex)
            return (lastObservationIndex + 1, latestPoolObservationIndex);
        return (latestPoolObservationIndex + UNIV3_MAX_CARDINALITY, lastObservationIndex);
    }
}
