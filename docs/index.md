# Uniswap V3 Volatility Oracle Docs

**Volatility** is defined as a measure of fluctuation in a quantity over a period of time. Volatility is a directionless measure i.e. market participants can use it to bet on amount of directionless variation in a price of an asset. VIX is a popular Volatility index used in traditional finance and has an average daily notional [volume of ~400M](https://ycharts.com/indicators/cboe_vix_volume) last month.

Oracles are data feeds that bring data from off the blockchain (off-chain) data sources and puts it on the blockchain (on-chain) for smart contracts to use. This is necessary because smart contracts running on Ethereum cannot access information stored outside the blockchain network. This repository builds an onchain oracle for calculating and exposing volatility across Uniswap pairs.

**How will this impact Uniswap ecosystem?**

- This will bring a new use-case into the Uniswap periphery.
- If users can easily hedge their Impermanent loss then they can supply liquidity to non-stable-coin pairs. Currently Uniswap Protocol has [$4.4B TVL $2.4B](https://info.uniswap.org/#/) of which is due to 3 stable-coins (USDC, USDT DAI). The ability to hedge Impermanent loss will significantly increase non-stable-coin TVL.
- More liquidity means lesser slippage i.e. more trading volume and in turn more fees for the ecosystem.

## Why build a Decentralized Volatility Oracle?

Although, decentralization brings the obvious and much talked about removal of centralization risk while building oracles. I would argue that decentralization adds another benefit i.e. **scalability**. Volatility Oracles built using UniV3 will be **available for every token** pair. This means that any new token or structured product can start integrating with the volatility Oracles from first Day.

## How it works?

The contract stores accumulators which help in calculating Time Weighted Standard Deviation of ticks aka volatility for a UniV3 Pool. The pool already calculates accumulators to enable calculation of TWAP price by storing the `tickCumulative` this contract stores `tickSquareCumulative` which helps in calculating the volatility.

More details can be found in the [technical page](https://ankitchiplunkar.com/v3-volatility-oracle/technical/).
