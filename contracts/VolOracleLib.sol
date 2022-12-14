// SPDX-License-Identifier
pragma solidity >=0.8.4;

import "@prb/math/src/UD60x18.sol";

/// @title Library to help calculate volatility between a UniV3 Pool
/// @author Ankit Chiplunkar & Jing Fan
/// @notice Helper functions and structs to calculate vlatility
library VolOracleLib {
    /// @notice Number of observations to store in the oracle, stores 30 days of data (with some buffer)
    uint256 public constant OBSERVATION_SIZE = 345600;

    /// @notice Struct that stores a single observation
    struct VolObservation {
        /// @dev the block timestamp of the observation
        uint32 blockTimestamp;
        /// @dev the tick accumulator, i.e. tick * time elapsed since the pool was first initialized
        int56 tickCumulative;
        /// @dev the tick square accumulator, i.e. tick * tick * time elapsed since the oracle was first initialized
        uint112 tickSquareCumulative;
    }

    /// @notice Struct that stores the accumulators and basic info for a pool
    struct VolOracleState {
        VolObservation[345600] observations;
        /// @dev Stores timestamp of the last uniswap observation which was filled in
        uint256 lastBlockTimestamp;
        /// @dev last observation index in uniswap pool
        uint256 lastCheckedUniswapObservationIndex;
        /// @dev observation index for volatility observations
        uint256 observationIndex;
        /// @dev marked as true if the pool is initialized
        bool initialized;
    }

    /// @notice Calculates the volatility of a pool
    /// @dev calculate the standdevation from VolOracleState struct and a target end timestamp
    /// @param self VolOracleState array for a pool
    /// @param target last timestamp from between which we need to calculate the volatility
    /// @return standardDeviation standard deviation for the pool prices between the given time
    function calculateVol(
        VolOracleState storage self,
        uint32 target
    ) internal view returns (uint256 standardDeviation) {
        uint256 startIndex = getObservationIndexBeforeOrAtTarget(self, target);
        uint256 endIndex = self.observationIndex;
        require(startIndex != endIndex, "no new observations to calculate the volatility");
        VolOracleLib.VolObservation memory startObservation = self.observations[startIndex];
        VolOracleLib.VolObservation memory endObservation = self.observations[endIndex];
        uint256 tickSquareSum = endObservation.tickSquareCumulative - startObservation.tickSquareCumulative;
        uint256 timeEclapsed = uint256(endObservation.blockTimestamp - startObservation.blockTimestamp);
        uint256 tickAvg = uint256(uint56(endObservation.tickCumulative - startObservation.tickCumulative)) /
            timeEclapsed;
        return fromUD60x18(toUD60x18((tickSquareSum - tickAvg * tickAvg * timeEclapsed) / (timeEclapsed - 1)).sqrt());
    }

    /// @notice Gets the index which lies before or at a target timestamp
    /// @dev get the obesrvation index right before or at the target timestamp, using binary search
    /// @param self VolOracleState array for a pool
    /// @param _target last timestamp from between which we need to calculate the volatility
    /// @return observationIndexAfterTarget the index of the observation which is before or at the target timestamp
    function getObservationIndexBeforeOrAtTarget(
        VolOracleState storage self,
        uint32 _target
    ) internal view returns (uint256 observationIndexAfterTarget) {
        require(self.initialized, "the state has not been initialized");
        uint256 left = (self.observationIndex + 1) % OBSERVATION_SIZE; //oldest
        uint32 oldestTimestamp = self.observations[left].blockTimestamp;
        if (oldestTimestamp == 0) {
            oldestTimestamp = self.observations[0].blockTimestamp;
        }
        require(oldestTimestamp <= _target, "target timestamp is older than the oldest observation");
        uint256 right = left + OBSERVATION_SIZE - 1; //latest
        uint256 idx;
        while (true) {
            if (left >= right) break;

            idx = (left + right) / 2;

            VolOracleLib.VolObservation storage curObservation = self.observations[idx % OBSERVATION_SIZE];
            if (curObservation.blockTimestamp == 0) {
                // hasn't been initialized
                left = idx + 1;
                continue;
            }

            if (curObservation.blockTimestamp <= _target) {
                left = idx + 1;
            } else {
                right = idx - 1;
            }
        }

        left = left % OBSERVATION_SIZE;
        VolOracleLib.VolObservation memory observation = self.observations[left];

        if (observation.blockTimestamp <= _target) {
            return left;
        } else {
            return (left + OBSERVATION_SIZE - 1) % OBSERVATION_SIZE;
        }
    }
}
