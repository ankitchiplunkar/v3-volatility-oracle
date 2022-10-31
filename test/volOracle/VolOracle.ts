import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";

import type { Signers } from "../types";
import { shouldFetchTheCorrectStartEndIndex, shouldFillInObservationsCorrectly, shouldInitPoolCorrectly } from "./VolOracle.behavior";
import { deployVolOracleFixture } from "./VolOracle.fixture";

describe("Unit tests", function () {
  before(async function () {
    this.signers = {} as Signers;

    const signers: SignerWithAddress[] = await ethers.getSigners();
    this.signers.admin = signers[0];

    this.loadFixture = loadFixture;
  });

  describe("VolOracle", function () {
    beforeEach(async function () {
      const { volOracle } = await this.loadFixture(deployVolOracleFixture);
      this.volOracle = volOracle;
    });

    describe("Initialize Pool", function () {
      shouldInitPoolCorrectly();
    });

    describe("Fetch Indexes", function() {
      shouldFetchTheCorrectStartEndIndex();
    });

    describe("Fill In Observations", function() {
      // shouldFillInObservationsCorrectly();
    });
  });
});
