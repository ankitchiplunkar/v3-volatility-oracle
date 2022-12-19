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
        expected: 1,
      },
      {
        args: [
          [0, 1001, 1001],
          [1, 1002, 1002],
          [2, 1006, 1018],
        ],
        expected: 3,
      },
      {
        args: [
          [0, 1001, 1001],
          [1, 1002, 1010],
          [2, 1006, 1050],
        ],
        expected: 6,
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

  describe("test with complex data", async function () {
    const tests: { args: [number, number, number][]; expected: number }[] = [
      {
        args: [
          [1671404067, -8637652944270, 0],
          [1671404151, -8637676328106, 6509568881844],
          [1671404191, -8637687463306, 9609385857844],
          [1671404199, -8637689690354, 10229353707132],
          [1671404201, -8637690247128, 10384352350670],
          [1671404227, -8637697485216, 12399349192814],
          [1671404229, -8637698041990, 12554347836352],
          [1671404233, -8637699155546, 12864349577636],
          [1671404303, -8637718642776, 18289380050106],
          [1671404321, -8637723653778, 19684387885884],
          [1671404353, -8637732562194, 22164383999292],
          [1671404365, -8637735902838, 23094375860520],
          [1671404423, -8637752049110, 27589239644968],
          [1671404431, -8637754276174, 28209216402480],
          [1671404433, -8637754832940, 28364210591858],
          [1671404453, -8637760400640, 29914174756358],
          [1671404487, -8637769865798, 32549151696504],
          [1671404489, -8637770422568, 32704148112954],
          [1671404493, -8637771536096, 33014134264650],
          [1671404495, -8637772092848, 33169120659402],
          [1671404499, -8637773206352, 33479093448906],
          [1671404503, -8637774319848, 33789061784410],
          [1671404505, -8637774876590, 33944042611692],
          [1671404559, -8637789908624, 38128524948306],
          [1671404569, -8637792692324, 38903423517306],
          [1671404575, -8637794362544, 39368362658706],
          [1671404591, -8637798816464, 40608200369106],
          [1671404593, -8637799373202, 40763178969428],
          [1671404595, -8637799929938, 40918156456276],
          [1671404597, -8637800486666, 41073129489268],
          [1671404599, -8637801043390, 41228100295356],
          [1671404603, -8637802156830, 41538037453756],
          [1671404605, -8637802713544, 41693002692654],
          [1671404609, -8637803826964, 42002928716754],
          [1671404613, -8637804940368, 42312845833558],
          [1671404615, -8637805497072, 42467805505366],
          [1671404621, -8637807167184, 42932684520790],
          [1671404623, -8637807723890, 43087645306008],
          [1671404641, -8637812734280, 44482312414458],
          [1671404643, -8637813290990, 44637275426508],
          [1671404649, -8637814961126, 45102167802924],
          [1671404653, -8637816074582, 45412113868908],
          [1671404655, -8637816631294, 45567077994380],
          [1671404657, -8637817188004, 45722041006430],
          [1671404669, -8637820528228, 46651799037278],
          [1671404713, -8637832775672, 50060887322122],
          [1671404715, -8637833332366, 50215841426940],
          [1671404719, -8637834445750, 50525747409804],
          [1671404721, -8637835002440, 50680699287854],
          [1671404729, -8637837229200, 51300506800054],
          [1671404733, -8637838342556, 51610397195738],
          [1671404737, -8637839455896, 51920278684638],
          [1671404743, -8637841125912, 52385104258014],
          [1671404747, -8637842239248, 52694983520238],
          [1671404751, -8637843352568, 53004853875838],
          [1671404765, -8637847249216, 54089415706974],
          [1671404783, -8637852259228, 55483872386982],
          [1671404809, -8637859495938, 57498102064832],
          [1671404813, -8637860609266, 57807976873728],
          [1671404817, -8637861722574, 58117840549444],
          [1671404821, -8637862835886, 58427706451780],
          [1671404835, -8637866732464, 59512229316786],
          [1671404853, -8637871742350, 60906615857508],
          [1671404857, -8637872855650, 61216475080008],
          [1671404881, -8637879535474, 63075643774632],
          [1671404943, -8637896791686, 67878496235744],
          [1671404965, -8637902914946, 69582783191544],
          [1671404975, -8637905698206, 70357436814304],
          [1671404977, -8637906254854, 70512365312256],
          [1671404979, -8637906811498, 70667291583624],
          [1671404983, -8637907924778, 70977139673224],
          [1671404991, -8637910151330, 71596831399312],
          [1671404995, -8637911264602, 71906675035808],
          [1671404999, -8637912377870, 72216516445764],
          [1671405001, -8637912934502, 72371436037476],
          [1671405005, -8637914047770, 72681277447432],
          [1671405009, -8637915161034, 72991116630856],
          [1671405067, -8637931303362, 77483784790504],
          [1671405075, -8637933529890, 78103463157352],
          [1671405077, -8637934086520, 78258381635802],
          [1671405081, -8637935199788, 78568223045758],
          [1671405089, -8637937426316, 79187901412606],
          [1671405099, -8637940209466, 79962493804856],
          [1671405101, -8637940766094, 80117411170048],
          [1671405129, -8637948558914, 82286269868348],
          [1671405133, -8637949672158, 82596097919232],
          [1671405137, -8637950785394, 82905921517156],
          [1671405141, -8637951898610, 83215733982820],
          [1671405145, -8637953011830, 83525548674920],
          [1671405167, -8637959134540, 85229529481470],
          [1671405183, -8637963587436, 86468797155646],
          [1671405227, -8637975832900, 89876783259630],
          [1671405231, -8637976946112, 90186593498866],
          [1671405235, -8637978059316, 90496399285270],
          [1671405241, -8637979729128, 90961111304494],
          [1671405245, -8637980842324, 91270912638098],
          [1671405247, -8637981398916, 91425809965330],
          [1671405255, -8637983625292, 92045403727002],
          [1671405257, -8637984181884, 92200301054234],
          [1671405261, -8637985295064, 92510093482334],
        ],
        expected: 646,
      },
    ];

    tests.forEach(({ args, expected }) => {
      it(`should calculate the correct vol`, async function () {
        await fakeVolOracleData(volOracleLibTest, 100, 0, args);

        const vol = await volOracleLibTest.calculateVol(1671404067);
        expect(vol).to.equal(expected);
      });
    });
  });
});
