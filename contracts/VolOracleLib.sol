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

    // TODO: WIP
    // @dev calculate the standdevation from startIndex to endIndex
    function calculateVol(VolOracleState storage self, uint32 target) internal view returns (uint256 stanDeviation) {
        uint256 startIndex = getObservationIndexBeforeOrAtTarget(self, target);
        uint256 endIndex = self.observationIndex;
        VolOracleLib.VolObservation memory startObservation = self.observations[startIndex];
        VolOracleLib.VolObservation memory endObservation = self.observations[endIndex];
        uint256 tickSquareSum = endObservation.tickSquareCumulative - startObservation.tickSquareCumulative;
        uint256 timeEclapsed = uint256(endObservation.blockTimestamp - startObservation.blockTimestamp);
        uint256 tickAvg = uint256(uint56(endObservation.tickCumulative - startObservation.tickCumulative)) /
            timeEclapsed;
        uint256 stddev = (tickSquareSum - tickAvg * tickAvg * timeEclapsed) / timeEclapsed;
        return stddev;
    }

    // @dev get the obesrvation index right before or at the target timestamp, using binary search
    function getObservationIndexBeforeOrAtTarget(VolOracleState storage self, uint32 _target)
        private
        view
        returns (uint256 observationIndexAfterTarget)
    {
        uint256 l = (self.observationIndex + 1) % OBSERVATION_SIZE;
        uint256 r = l + OBSERVATION_SIZE - 1;
        uint256 idx;
        while (true) {
            idx = (l + r) / 2;

            VolOracleLib.VolObservation memory curObservation = self.observations[idx % OBSERVATION_SIZE];
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
        VolOracleLib.VolObservation memory observation = self.observations[l];
        if (observation.blockTimestamp <= _target) {
            return l;
        } else {
            return (l - 1 + OBSERVATION_SIZE) % OBSERVATION_SIZE;
        }
    }
}
