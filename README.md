# UniV3 Volatility Oracle [![Open in Gitpod][gitpod-badge]][gitpod] [![Github Actions][gha-badge]][gha] [![Hardhat][hardhat-badge]][hardhat] [![License: MIT][license-badge]][license]

[gitpod]: https://gitpod.io/#https://github.com/ankitchiplunkar/v3-volatility-oracle
[gitpod-badge]: https://img.shields.io/badge/Gitpod-Open%20in%20Gitpod-FFB45B?logo=gitpod
[gha]: https://github.com/ankitchiplunkar/v3-volatility-oracle/actions
[gha-badge]: https://github.com/ankitchiplunkar/v3-volatility-oracle/actions/workflows/ci.yml/badge.svg
[hardhat]: https://hardhat.org/
[hardhat-badge]: https://img.shields.io/badge/Built%20with-Hardhat-FFDB1C.svg
[license]: https://opensource.org/licenses/MIT
[license-badge]: https://img.shields.io/badge/License-MIT-blue.svg

Solidity code + tests to develop and deploy volatility oracle as described [here](https://www.notion.so/ankitchiplunkar/Decentralized-Volatility-Oracle-c4a5f84e37d94522840895d507ff5075).

## How it works?

The contract stores accumulators which help in calculating Time Weighted Standard Deviation of ticks aka volatility for a UniV3 Pool. The pool already calculates accumulators to enable calculation of TWAP price by storing the `tickCumulative` this contract stores `tickSquareCumulative` which helps in calculating the volatility.

More details can be found in the [technical page](https://github.com/ankitchiplunkar/v3-volatility-oracle/blob/main/TECHNICAL.md).

## Why build a Decentralized Volatility Oracle?

Although, decentralization brings the obvious and much talked about removal of centralization risk while building oracles. I would argue that decentralization adds another benefit i.e. **scalability**. Volatility Oracles built using UniV3 will be **available for every token** pair. This means that any new token or structured product can start integrating with the volatility Oracles from Day 1.

## Usage

### Pre Requisites

Before being able to run any command, you need to create a `.env` file and set a BIP-39 compatible mnemonic as an environment
variable. You can follow the example in `.env.example`.

Then, proceed with installing dependencies:

```sh
$ yarn install
```

### Compile

Compile the smart contracts with Hardhat:

```sh
$ yarn compile
```

### TypeChain

Compile the smart contracts and generate TypeChain bindings:

```sh
$ yarn typechain
```

### Test

Run the tests with Hardhat:

```sh
$ yarn test
```

### Coverage

Generate the code coverage report:

```sh
$ yarn coverage
```

### Report Gas

See the gas usage per unit test and average gas per method call:

```sh
$ REPORT_GAS=true yarn test
```

### Clean

Delete the smart contract artifacts, the coverage reports and the Hardhat cache:

```sh
$ yarn clean
```
