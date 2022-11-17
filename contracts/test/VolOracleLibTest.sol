// SPDX-License-Identifier
pragma solidity >=0.8.4;

import { VolOracleLib } from "../VolOracleLib.sol";

contract VolOracleLibTest {
    using VolOracleLib for VolOracleLib.VolOracleState;
    using VolOracleLib for VolOracleLib.VolObservation;

    VolOracleLib.VolOracleState public oracleState;

    struct InitializeParams {
        uint32 lastBlockTimestamp;
        uint256 lastObservationIndex;
        uint256 observationIndex;
    }

    struct ObservationParams {
        // the block timestamp of the observation
        uint32 blockTimestamp;
        // the tick accumulator, i.e. tick * time elapsed since the pool was first initialized
        int56 tickCumulative;
        // the tick square accumulator, i.e. tick * tick * time elapsed since the oracle was first initialized
        uint112 tickSquareCumulative;
    }

    function observationSize() public pure returns (uint256) {
        return VolOracleLib.OBSERVATION_SIZE;
    }

    function batchUpdate(ObservationParams[] calldata params) external {
        uint256 startIndex = oracleState.lastBlockTimestamp == 0 ? 0 : oracleState.observationIndex + 1;
        for (uint256 i = 0; i < params.length; i++) {
            oracleState.observations[(startIndex + i) % VolOracleLib.OBSERVATION_SIZE] = VolOracleLib.VolObservation(
                params[i].blockTimestamp,
                params[i].tickCumulative,
                params[i].tickSquareCumulative
            );
        }
        oracleState.lastBlockTimestamp = block.timestamp;
        oracleState.observationIndex = (startIndex + params.length - 1) % VolOracleLib.OBSERVATION_SIZE;
    }

    /**
     *  Test only. Currently the function is private. Please change the visibility of 
     *  VolOracleLib.getObservationIndexBeforeOrAtTarget() to internal and uncomment this function if you would like 
     * to enable unit test.
    function getObservationIndexBeforeOrAtTarget(uint32 target) external view returns (uint256) {
        return oracleState.getObservationIndexBeforeOrAtTarget(target);
    }
     */

    function calculateVol(uint32 target) external view returns (uint256) {
        return oracleState.calculateVol(target);
    }
}
