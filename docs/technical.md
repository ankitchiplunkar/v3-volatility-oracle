# Time weighted standard deviation

## Technical derivations

We define and derive two methods for calculating Time Weighted Standard Deviation of Price Tick of a Uniswap v3 pair. This Standard deviation can be treated as a proxy for historical volatility between the two tokens.

**Key Definitions:**

- $t_{ij}$: Time difference between two time stamps $t_i$ and $t_j$
- $p_{ij}$: Price tick (as defined by UniV3 whitepaper) which remains constant between two time stamps $t_i$ and $t_j$ , i.e. remains constant for a total time period of $t_{ij}$
- $\Delta t$: Total time between the start and end of the mean and variance calculation
- $\bar{p}$ : Time weighted Mean value of the price ticks in $\Delta t$ time period
- $s^2$ : Time weighted Variance of the prices in time period

### Time Weighted Mean value

The mean value of price ticks is

$$
\bar{p} = \frac{\sum  p_{ij}}{\sum t}
$$

The prices are actually constant between the time periods of $t_{ij}$ so we can rewrite the above equation as:

$$
\bar{p} = \frac{\sum t_{ij} p_{ij}}{\Delta t}
$$

### Time Weighted Variance

We can write the variance of the price tick between the preferred time period as:

$$
s^2 =
\frac{\sum  (p_{ij} - \bar{p})^2}{\sum t}
$$

$$
s^2 =
\frac{\sum t_{ij}  (p_{ij} - \bar{p})^2}{\Delta t }
$$

$$
s^2 =
\frac{\sum t_{ij}  (p_{ij}^2 - 2p_{ij}\bar{p} + \bar{p}^2)}{\Delta t }
$$

$$
s^2 =
\frac{\sum t_{ij}  p_{ij}^2 - 2\bar{p}\sum t_{ij} p_{ij} + \bar{p}^2 \sum t_{ij}}{\Delta t}
$$

$$
s^2 =
\frac{\sum t_{ij}  p_{ij}^2 - 2\Delta t \bar{p}^2 + \Delta t\bar{p}^2 }{\Delta t}
$$

$$
s^2 =
\frac{\sum t_{ij}  p_{ij}^2 - \Delta t \bar{p}^2 }{\Delta t}
$$

The above formla for variance is numerically unstable when the standard deviation is very close to the mean value. Welford presented a more stable method for calculating the variance, we present the key formulas for that below.

## Welford Time Weighted Variance

To calculate time weighted mean and variance we can also defer to welford method. Welford method defines an online method to calculate the variance, i.e. variance values are build based on the last mean and variance calculation.

**Key definitions**

- $\Delta t_{0,N}$: Time period between time $t_0$ and $t_N$
- $\bar{p}_{0,N}$ : Time weighted Mean value of the price ticks in between time $t_0$ and $t_N$ time period
- $s^2_{0,N}$ : Time weighted Variance of the prices ticks in between time $t_0$ and $t_N$ time period

### Time Weighted Mean value

$$
\bar{p}_{0,N} = \bar{p}_{0,N-1} + \frac{\Delta t_{N,N-1} \times p_{N,N-1}}{\Delta t_{0,N}}
$$

The above formula lets us update the current value of mean based on the last value of mean, and new price tick between time $t_N$ and $t_{N-1}$

Welford defines $M$ as:

$$
s^2 = \frac{M}{\Delta t}
$$

$$
M_{0,N} = M_{0,N-1} + \Delta t_{N,N-1} (p_{N,N-1} - \bar{p_{0,N-1}}) \times (p_{N,N-1} - \bar{p_{0,N}})
$$

One limitation for the welford formulation is that we need to know the mean values or time period of the variance calculation before. This means if we want to implement welford method we need to have one contract per time period.
