import axios from "axios";
import { config as dotenvConfig } from "dotenv";
import { ethers } from "ethers";
import { resolve } from "path";

import { abi as VolOracleABI } from "../artifacts/contracts/VolOracle.sol/VolOracle.json";

const dotenvConfigPath: string = "../.env";
dotenvConfig({ path: resolve(__dirname, dotenvConfigPath) });

const alchemyApiKey: string | undefined = process.env.ALCHEMY_API_KEY;
if (!alchemyApiKey) {
  throw new Error("Please set your ALCHEMY_API_KEY in a .env file");
}

const provider = new ethers.providers.JsonRpcProvider(`https://polygon-mainnet.g.alchemy.com/v2/${alchemyApiKey}`);

const poolAddress = "0xa374094527e1673a86de625aa59517c5de346d32";
const contractAddress = "0x2053b5A5667D31300b3F5b6d47046eD58028527b";
const contract = new ethers.Contract(contractAddress, VolOracleABI, provider);
const privateKey: string | undefined = process.env.PRIVATE_KEY;

if (!privateKey) {
  throw new Error("Please set your PRIVATE_KEY in a .env file");
}

const wallet = new ethers.Wallet(`0x${privateKey}`, provider);

const contractWithSigner = contract.connect(wallet);

export async function initPool() {
  const gasConfig = await getGasConfig();
  const tx = await contractWithSigner.initPool(poolAddress, gasConfig);
  console.log(tx.hash);
}

export async function fillInObservations() {
  const gasConfig = await getGasConfig();

  const tx = await contractWithSigner.fillInObservations(poolAddress, gasConfig);
  console.log(tx.hash);
}

export async function getOracleStates() {
  const oracleState = await contract.oracleStates(poolAddress);
  return {
    lastBlockTimestamp: oracleState.lastBlockTimestamp.toNumber(),
    lastCheckedUniswapObservationIndex: oracleState.lastCheckedUniswapObservationIndex.toNumber(),
    observationIndex: oracleState.observationIndex.toNumber(),
    initialized: oracleState.initialized,
  };
}

export async function getObservation(index: number) {
  const observation = await contract.getObservation(poolAddress, index);
  return {
    blockTimestamp: observation.blockTimestamp,
    tickCumulative: observation.tickCumulative.toNumber(),
    tickSquareCumulative: observation.tickSquareCumulative.toNumber(),
  };
}

export async function getVol(days: number) {
  const vol = await contract.getVol(poolAddress, days);
  return vol.toNumber();
}

export async function logStates() {
  const oracleState = await getOracleStates();
  console.log("===== logging oracleState =====");
  console.log(oracleState);

  const lastObservation = await getObservation(oracleState.observationIndex);
  console.log("===== logging last observation =====");
  console.log(lastObservation);
}

// https://github.com/ethers-io/ethers.js/issues/2828
async function getGasConfig() {
  // get max fees from gas station
  let maxFeePerGas = ethers.BigNumber.from(40000000000); // fallback to 40 gwei
  let maxPriorityFeePerGas = ethers.BigNumber.from(40000000000); // fallback to 40 gwei
  try {
    const { data } = await axios({
      method: "get",
      url: "https://gasstation-mainnet.matic.network/v2",
    });
    maxFeePerGas = ethers.utils.parseUnits(Math.ceil(data.fast.maxFee) + "", "gwei");
    maxPriorityFeePerGas = ethers.utils.parseUnits(Math.ceil(data.fast.maxPriorityFee) + "", "gwei");
  } catch {
    // ignore
  }
  return {
    maxFeePerGas,
    maxPriorityFeePerGas,
  };
}
