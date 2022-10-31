import { expect } from "chai";
import { BigNumber } from "ethers";
import { network } from "hardhat";

const ETH_USDC_POOL: string = "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8";
const DAI_HOPR_POOL: string = "0x87986Ae1e99f99Da1f955D16930DC8914fFBED56";
const NEW_BLOCK: number = 15846999;
const ALCHEMY_API_KEY: string | undefined = process.env.ALCHEMY_API_KEY;


type VolOracleType = [
  lastBlockTimestamp: BigNumber,
  lastObservationIndex: BigNumber,
  observationIndex: BigNumber
];

type ObservationType = [
  blockTimestamp: number,
  tickCumulative: BigNumber,
  tickSquareCumulative: BigNumber
];


export function shouldInitPoolCorrectly(): void {
  it("Should have clean states before pool initialization", async function() {
    const oracleState: VolOracleType = await this.volOracle.oracleStates(ETH_USDC_POOL);
    for (let i = 0; i < 3; i++) {
      expect(oracleState[i]).to.equal(0);
    }

    const observation: ObservationType = await this.volOracle.getObservation(ETH_USDC_POOL, 0);
    for (let i = 0; i < 3; i++) {
      expect(observation[i]).to.equal(0);
    }
  });

  it("Should fail if the pool has already been initialized", async function() {
    await this.volOracle.initPool(ETH_USDC_POOL);
    await expect(this.volOracle.initPool(ETH_USDC_POOL)).to.be.revertedWith('Pool already initialized');
  });

  it("Should fail if the uniswap pool does not have required cardinality", async function() {
    await expect(this.volOracle.initPool(DAI_HOPR_POOL)).to.be.revertedWith('Pool not at min cardinality');
  });

  it("Should initialize the oracle for pool correclty", async function () {
    await this.volOracle.initPool(ETH_USDC_POOL);
    const oracleState: VolOracleType = await this.volOracle.oracleStates(ETH_USDC_POOL);
    
    // 0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8 pool at block 15846965
    expect(oracleState[0]).to.equal(1666964989);
    expect(oracleState[1]).to.equal(77);
    expect(oracleState[2]).to.equal(0);

    const observation0: ObservationType = await this.volOracle.getObservation(ETH_USDC_POOL, 0);
    expect(observation0[0]).to.equal(1666964939);
    expect(observation0[1]).to.equal(9277003425106);
    expect(observation0[2]).to.equal(0);

   const observation1: ObservationType = await this.volOracle.getObservation(ETH_USDC_POOL, 1);
   expect(observation1[0]).to.equal(0);
   expect(observation1[1]).to.equal(0);
   expect(observation1[2]).to.equal(0);
  
  });
}

export function shouldFetchTheCorrectStartEndIndex(): void {
  it("Should reutrn the correct start and end index", async function() {
    await this.volOracle.initPool(ETH_USDC_POOL);

    
    /*
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
            blockNumber: 15846965,
          },
        },
      ],
    });
    */

    const [startIdx, endIdx] = await this.volOracle.fetchIntermediateIndexes(ETH_USDC_POOL);
    // TODO: checkoutput
    expect(startIdx).to.equal(78);
    expect(endIdx).to.equal(78);

  });
}

export function shouldFillInObservationsCorrectly(): void {
  it("Should fill in observations correctly", async function() {
    // TODO
  });
}