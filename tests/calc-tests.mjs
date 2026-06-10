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

const comsolQuickSpike = `% Model\tquick_spike.mph
% Time (s)\t"use_scan=0, Terminal current (mA)"
${Array.from({ length: 651 }, (_, i) => {
  const time = i * 2e-5;
  let current = 1e-8 * Math.sin(i / 5);
  if (i === 100) current = -7.9;
  if (i > 100 && i < 600) current = 2.22e-4;
  if (i === 600) current = -1.02;
  return `${time}\t${current}`;
}).join("\n")}`;
const parsedComsol = parseData(comsolQuickSpike, "comsol-quick-spike.txt");
assert.equal(parsedComsol.errors.length, 0);
assert.equal(parsedComsol.unitHints.timeUnit, "s");
assert.equal(parsedComsol.unitHints.currentUnit, "mA");
const comsolTrace = buildTraces([parsedComsol], {
  timeColumn: 0,
  currentColumn: 1,
  timeUnit: "s",
  currentUnit: "mA",
  invertCurrent: false,
  useAdjacentPairs: false,
})[0];
const processedComsol = processTrace(comsolTrace, {
  baselineMode: "manual",
  manualBaseline: 0,
  integrationStart: NaN,
  integrationEnd: NaN,
  excludeSpikeUs: 0,
  smoothData: false,
  smoothWindow: 5,
});
assert.equal(processedComsol.edges.confidence, "spike-auto");
assert.equal(processedComsol.edges.electronicSpikeIndex, 100);
assert.equal(processedComsol.integration.startIndex, 101);
assert.equal(processedComsol.integration.endIndex, 599);
assert.ok(processedComsol.qIonC > 0);

console.log(`Synthetic validation error: ${errorPct.toFixed(3)}%`);
console.log("Calculator validation tests passed.");
