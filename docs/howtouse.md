# How to use this oracle?

In traditional finance Realized Volatility is defined as the Standard Deviation of returns over a time period. Due to the way prices are stored in Uniswap contract, we calculate Volatility in a different way compared to Traditional Finance.

We define Realized Volatility (RV) as the Time-Weighted Geometric Standard Deviation of Uniswap prices. The final formula for Realized Volatility is:

$$
RV = 1.001^{\sqrt {
\frac{\sum t_{ij}  p_{ij}^2 - \Delta t \bar{p}^2 }{\Delta t} }}
$$

Where:

- $t_{ij}$: Time difference between two time stamps $t_i$ and $t_j$
- $p_{ij}$: Price tick (as defined by UniV3 whitepaper) which remains constant between two time stamps $t_i$ and $t_j$ , i.e. remains constant for a total time period of $t_{ij}$
- $\Delta t$: Total time between the start and end of the mean and variance calculation
- $\bar{p}$ : Time weighted Mean value of the price ticks in $\Delta t$ time period
- $RV$ : Time weighted Geometric Stadard Deviation of the prices in time period

Technical derivation can be found on the [technical page](https://ankitchiplunkar.com/v3-volatility-oracle/technical/).

### How are these values calculated?

The Uniswap pair contract already stores the accumulator $\Delta t p_{ij}$ aka `tickCumulative` to calculate the Time-Weighted Geomteric mean. Similarly, to calculate the $RV$ we need to calculate and store an extra accumulator i.e. $\Delta t p_{ij}^2$ aka `tickSquareCumulative`

To store `tickSquareCumulative` the Volatility Oracle constantly pings the desired Uniswap Pair contract and stores these values in a struct called [VolObservation](https://github.com/ankitchiplunkar/v3-volatility-oracle/blob/main/contracts/VolOracleLib.sol#L12) using the function [fillInObservations](https://github.com/ankitchiplunkar/v3-volatility-oracle/blob/main/contracts/VolOracle.sol#L150).

```
struct VolObservation {
        /// @dev the block timestamp of the observation
        uint32 blockTimestamp;
        /// @dev the tick accumulator, i.e. tick * time elapsed since the pool was first initialized
        int56 tickCumulative;
        /// @dev the tick square accumulator, i.e. tick * tick * time elapsed since the oracle was first initialized
        uint112 tickSquareCumulative;
    }
```

Finally, a downstream contract can just call the [`getVolByHours`](https://github.com/ankitchiplunkar/v3-volatility-oracle/blob/main/contracts/VolOracle.sol#L113) function on the VolOracle contract and get the values in a desired time-range.

### Is this active?

Yes!

The [volatility contract](https://polygonscan.com/address/0x60e2CB42DcBa04b8cb2ae657040B1B98852077A4#events) is already live for ETH-Matic pair on polygon.
