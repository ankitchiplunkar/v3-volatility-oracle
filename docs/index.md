# Uniswap V3 Volatility Oracle Docs

## Why build a Decentralized Volatility Oracle?

Although, decentralization brings the obvious and much talked about removal of centralization risk while building oracles. I would argue that decentralization adds another benefit i.e. **scalability**. Volatility Oracles built using UniV3 will be **available for every token** pair. This means that any new token or structured product can start integrating with the volatility Oracles from Day 1.

## How it works?

The contract stores accumulators which help in calculating Time Weighted Standard Deviation of ticks aka volatility for a UniV3 Pool. The pool already calculates accumulators to enable calculation of TWAP price by storing the `tickCumulative` this contract stores `tickSquareCumulative` which helps in calculating the volatility.

More details can be found in the [technical page](https://github.com/ankitchiplunkar/v3-volatility-oracle/blob/main/TECHNICAL.md).
