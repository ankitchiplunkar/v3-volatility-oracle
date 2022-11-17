import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { ethers } from "hardhat";

import { VolOracleLibTest } from "../src/types/contracts/test";
import { VolOracleLibTest__factory } from "../src/types/factories/contracts/test";
import { OBSERVATION_SIZE, fakeVolOracleData } from "./helper";

const { expect } = chai;

describe("Vol Oracle Library tests", () => {
  let volOracleLibTest: VolOracleLibTest;
  let deployer: SignerWithAddress;
  const startTs = 10000;

  beforeEach("deploy contracts", async () => {
    [deployer] = await ethers.getSigners();
    const volOracleLibTestFactory = <VolOracleLibTest__factory>await ethers.getContractFactory("VolOracleLibTest");
    volOracleLibTest = await volOracleLibTestFactory.connect(deployer).deploy();
  });

  it("tests constants", async () => {
    expect(await volOracleLibTest.observationSize()).to.equal(OBSERVATION_SIZE);
  });

  /**
   *  Test only. Currently the function is private. Please change the visibility of VolOracleLib.getObservationIndexBeforeOrAtTarget() to internal,
   *  uncomment the function in VolOracleLibTest.sol and uncomment these tests if you would like to enable unit test.
  describe("Index Search", async function () {
    it("should return error when target is older than the oldest timestamp", async function () {
      await fakeVolOracleData(volOracleLibTest, 2, startTs);
      await expect(volOracleLibTest.getObservationIndexBeforeOrAtTarget(startTs - 1)).to.be.revertedWith(
        "target timestamp is older than the oldest observation",
      );
    });

    it("should return error if the oracle is not initialized", async function () {
      await expect(volOracleLibTest.getObservationIndexBeforeOrAtTarget(startTs)).to.be.revertedWith(
        "the state has not been initialized",
      );
    });

    describe("Index Search Batch Test", function () {
      const testSize = 10;
      const tests: { args: number; expected: number }[] = [];
      for (let i = 1; i <= testSize; ++i) {
        for (let j = 0; j <= i + 1; ++j) {
          tests.push({
            args: i, // size of the array
            expected: j >= i - 1 ? i - 1 : j, // target offset from the startTs
          });
        }
      }

      tests.forEach(({ args, expected }) => {
        it(`Searches index correctly for an observation array of size ${args} and target offset ${expected}`, async function () {
          await fakeVolOracleData(volOracleLibTest, args, startTs);
          const idx = await volOracleLibTest.getObservationIndexBeforeOrAtTarget(startTs + expected);
          expect(idx).to.equal(expected);
        });
      });
    });
  });
  */

  describe("Calculate Volatity", async function () {
    it("should calculate the correct vol when the price stays the same", async function () {
      const observationData: [number, number, number][] = [
        [0, 1001, 1001],
        [1, 1002, 1002],
        [2, 1003, 1003],
      ];
      await fakeVolOracleData(volOracleLibTest, 3, startTs, observationData);

      const vol = await volOracleLibTest.calculateVol(startTs);
      expect(vol).to.equal(0);
    });
  });

  describe("batch test with given data", async function () {
    const tests: { args: [number, number, number][]; expected: number }[] = [
      {
        args: [
          [0, 1001, 1001],
          [1, 1002, 1002],
          [2, 1005, 1011],
        ],
        expected: 2,
      },
      {
        args: [
          [0, 1001, 1001],
          [1, 1002, 1002],
          [2, 1006, 1018],
        ],
        expected: 9,
      },
    ];

    tests.forEach(({ args, expected }) => {
      it(`should calculate the correct vol when the price flunctuates with data ${args}`, async function () {
        await fakeVolOracleData(volOracleLibTest, 3, startTs, args);

        const vol = await volOracleLibTest.calculateVol(startTs);
        expect(vol).to.equal(expected);
      });
    });
  });

  it("should return error if there are no new observations to calculate the volatility", async function () {
    await fakeVolOracleData(volOracleLibTest, 3, startTs);

    await expect(volOracleLibTest.calculateVol(startTs + 100)).to.be.revertedWith(
      "no new observations to calculate the volatility",
    );
  });

  it("should return error if the target is too old and there are no enough observations to calculate the volatility", async function () {
    await fakeVolOracleData(volOracleLibTest, 3, startTs);

    await expect(volOracleLibTest.calculateVol(startTs - 1)).to.be.revertedWith(
      "target timestamp is older than the oldest observation",
    );
  });
});
