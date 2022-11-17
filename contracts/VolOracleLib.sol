// SPDX-License-Identifier
pragma solidity >=0.8.4;

library VolOracleLib {
    uint256 public constant OBSERVATION_SIZE = 345600;

    struct VolObservation {
        // the block timestamp of the observation
        uint32 blockTimestamp;
        // the tick accumulator, i.e. tick * time elapsed since the pool was first initialized
        int56 tickCumulative;
        // the tick square accumulator, i.e. tick * tick * time elapsed since the oracle was first initialized
        uint112 tickSquareCumulative;
    }

    struct VolOracleState {
        VolObservation[345600] observations;
        // @dev Stores timestamp of the last uniswap observation which was filled in
        uint256 lastBlockTimestamp;
        // @dev last observation index in uniswap pool
        uint256 lastCheckedUniswapObservationIndex;
        // @dev observation index for volatility observations
        uint256 observationIndex;
        // @dev marked as true if the pool is initialized
        bool initialized;
    }

    // @dev calculate the standdevation from startIndex to endIndex
    function calculateVol(VolOracleState storage self, uint32 target) internal view returns (uint256 stanDeviation) {
        uint256 startIndex = getObservationIndexBeforeOrAtTarget(self, target);
        uint256 endIndex = self.observationIndex;
        require(startIndex != endIndex, "no new observations to calculate the volatility");
        VolOracleLib.VolObservation memory startObservation = self.observations[startIndex];
        VolOracleLib.VolObservation memory endObservation = self.observations[endIndex];
        uint256 tickSquareSum = endObservation.tickSquareCumulative - startObservation.tickSquareCumulative;
        uint256 timeEclapsed = uint256(endObservation.blockTimestamp - startObservation.blockTimestamp);
        uint256 tickAvg = uint256(uint56(endObservation.tickCumulative - startObservation.tickCumulative)) /
            timeEclapsed;
        uint256 stddev = (tickSquareSum - tickAvg * tickAvg * timeEclapsed) / (timeEclapsed - 1);
        return stddev;
    }

    // @dev get the obesrvation index right before or at the target timestamp, using binary search
    // @return the index of the observation which is before or at the target timestamp
    function getObservationIndexBeforeOrAtTarget(VolOracleState storage self, uint32 _target)
        private
        view
        returns (uint256 observationIndexAfterTarget)
    {
        require(self.lastBlockTimestamp != 0, "the state has not been initialized");
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
