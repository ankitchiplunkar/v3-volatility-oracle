import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import type { VolOracle } from "../types/VolOracle";

type Fixture<T> = () => Promise<T>;

declare module "mocha" {
  export interface Context {
    volOracle: VolOracle;
    loadFixture: <T>(fixture: Fixture<T>) => Promise<T>;
    signers: Signers;
  }
}

export interface Signers {
  admin: SignerWithAddress;
}
