import assert from "node:assert/strict";
import {
  buildTraces,
  convertInputsToSI,
  computeResults,
  generateExperimentalSample,
  generateSyntheticSample,
  parseData,
  processTrace,
} from "../calc.js";

const defaultInputs = convertInputsToSI({
  thickness: 550,
  thicknessUnit: "nm",
  area: 0.09,
  areaUnit: "cm2",
  preloadBias: 0.8,
  builtInPotential: 1.2,
  temperature: 300,
  temperatureUnit: "K",
  thermalVoltage: 0.02585,
  manualThermalVoltage: false,
  relativePermittivity: 24.2,
});

const synthetic = generateSyntheticSample();
const parsedSynthetic = parseData(synthetic.text, synthetic.fileName);
assert.equal(parsedSynthetic.errors.length, 0);
assert.equal(parsedSynthetic.delimiter, "comma");

const syntheticTraces = buildTraces([parsedSynthetic], {
  timeColumn: 0,
  currentColumn: 1,
  timeUnit: synthetic.settings.timeUnit,
  currentUnit: synthetic.settings.currentUnit,
  invertCurrent: synthetic.settings.invertCurrent,
  useAdjacentPairs: false,
});
const processedSynthetic = syntheticTraces.map((trace) => processTrace(trace, {
  baselineMode: "manual",
  manualBaseline: 0,
  integrationStart: synthetic.settings.integrationStart,
  integrationEnd: synthetic.settings.integrationEnd,
  excludeSpikeUs: 0,
  smoothData: false,
  smoothWindow: 5,
}));
const syntheticResults = computeResults(processedSynthetic, defaultInputs, [1000]);
const errorPct = ((syntheticResults[0].qIonC - synthetic.expectedQ) / synthetic.expectedQ) * 100;
assert.ok(Math.abs(errorPct) < 5, `synthetic integral error ${errorPct}%`);
assert.ok(syntheticResults[0].n0Cm3 > 0);

const experimental = generateExperimentalSample();
const parsedExperimental = parseData(experimental.text, experimental.fileName);
assert.equal(parsedExperimental.errors.length, 0);
assert.equal(parsedExperimental.delimiter, "tab");
assert.ok(parsedExperimental.rows.length > 2600);

console.log(`Synthetic validation error: ${errorPct.toFixed(3)}%`);
console.log("Calculator validation tests passed.");
