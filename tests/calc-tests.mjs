import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTraces,
  convertInputsToSI,
  computeResults,
  generateExperimentalSample,
  generateSyntheticSample,
  parseData,
  processTrace,
} from "../calc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  if (i > 600) current = -0.05 * Math.exp(-(i - 600) / 8);
  return `${time}\t${current}`;
}).join("\n")}`;
const parsedComsol = parseData(comsolQuickSpike, "comsol-quick-spike.txt");
assert.equal(parsedComsol.errors.length, 0);
assert.equal(parsedComsol.unitHints.timeUnit, "s");
assert.equal(parsedComsol.unitHints.currentUnit, "mA");
const parsedSetfosHeader = parseData(`# Device current transient [mA/cm^2]
# Column format:
# t (us)\tJ\tJbimolecular
0\t0\t0
1000\t1\t0`, "setfos-header.txt");
assert.equal(parsedSetfosHeader.unitHints.timeUnit, "us");
assert.equal(parsedSetfosHeader.unitHints.currentUnit, "mA");
const comsolTrace = buildTraces([parsedComsol], {
  timeColumn: 0,
  currentColumn: 1,
  timeUnit: "s",
  currentUnit: "mA",
  invertCurrent: false,
  useAdjacentPairs: false,
})[0];
const processedComsol = processTrace(comsolTrace, {
  integrationMode: "slow-window",
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

const processedReturnSpike = processTrace(comsolTrace, {
  integrationMode: "return-spike",
  baselineMode: "manual",
  manualBaseline: 0,
  integrationStart: NaN,
  integrationEnd: NaN,
  excludeSpikeUs: 0,
  smoothData: false,
  smoothWindow: 5,
});
assert.equal(processedReturnSpike.edges.returnSpikeIndex, 600);
assert.equal(processedReturnSpike.integration.startIndex, 600);
assert.equal(processedReturnSpike.integration.endIndex, 650);
assert.equal(processedReturnSpike.baseline.mode, "return-spike zero baseline");
assert.ok(processedReturnSpike.qIonC > 0);

const excludedReturnSpike = processTrace(comsolTrace, {
  integrationMode: "return-spike",
  baselineMode: "manual",
  manualBaseline: 0,
  integrationStart: NaN,
  integrationEnd: NaN,
  excludeSpikeUs: 100,
  smoothData: false,
  smoothWindow: 5,
});
assert.ok(excludedReturnSpike.integration.startIndex > processedReturnSpike.integration.startIndex);
assert.ok(excludedReturnSpike.integration.startTime >= comsolTrace.raw[600].time + 100e-6);

const postSpikeSample = processTrace(comsolTrace, {
  integrationMode: "return-spike",
  baselineMode: "manual",
  manualBaseline: 0,
  integrationStart: NaN,
  integrationEnd: NaN,
  excludeSpikeUs: 0,
  startAfterSpikeSample: true,
  smoothData: false,
  smoothWindow: 5,
});
assert.equal(postSpikeSample.integration.startIndex, 601);

const broadPlateauNegativeSpike = `% Model\tplateau_return.mph
% Time (s)\tTerminal current (A)
${Array.from({ length: 1063 }, (_, i) => {
  const time = 0.008733 + i * 4.86e-6;
  let current = i < 40 ? 0 : 5.6e-4 + 1e-7 * Math.sin(i / 9);
  if (i >= 880) current = -2.6e-4 * Math.exp(-(i - 880) / 16);
  if (i === 250) current += 1.5e-5 * Math.sin(i);
  return `${time}\t${current}`;
}).join("\n")}`;
const parsedPlateau = parseData(broadPlateauNegativeSpike, "plateau-return.txt");
assert.equal(parsedPlateau.errors.length, 0);
const plateauTrace = buildTraces([parsedPlateau], {
  timeColumn: 0,
  currentColumn: 1,
  timeUnit: "s",
  currentUnit: "A",
  invertCurrent: false,
  useAdjacentPairs: false,
})[0];
const processedPlateauReturn = processTrace(plateauTrace, {
  integrationMode: "return-spike",
  baselineMode: "manual",
  manualBaseline: 0,
  integrationStart: NaN,
  integrationEnd: NaN,
  excludeSpikeUs: 0,
  smoothData: false,
  smoothWindow: 5,
});
assert.equal(processedPlateauReturn.edges.returnSpikeIndex, 880);
assert.equal(processedPlateauReturn.integration.startIndex, 880);
assert.ok(processedPlateauReturn.qIonC > 0);

const manualReturnWindow = processTrace(plateauTrace, {
  integrationMode: "return-spike",
  baselineMode: "manual",
  manualBaseline: 0,
  integrationStart: plateauTrace.raw[875].time,
  integrationEnd: plateauTrace.raw[885].time,
  excludeSpikeUs: 0,
  smoothData: false,
  smoothWindow: 5,
});
assert.equal(manualReturnWindow.integration.startIndex, 875);
assert.equal(manualReturnWindow.integration.endIndex, 885);

const tdcFixtureDir = path.resolve(__dirname, "../../Mobile_Ion_Calc_Test/Test TDC Files");
if (fs.existsSync(tdcFixtureDir)) {
  const expectedTdcN0Cm3 = [
    1.74665e17,
    2.04989e17,
    2.12949e17,
    2.15636e17,
    1.99766e17,
    2.04989e17,
    2.04989e17,
    7.49039e16,
    2.10013e17,
  ];
  const tdcInputs = convertInputsToSI({
    thickness: 550,
    thicknessUnit: "nm",
    area: 0.09,
    areaUnit: "cm2",
    preloadBias: 0.8,
    builtInPotential: 1.2,
    temperature: 300,
    temperatureUnit: "K",
    thermalVoltage: 0.02585,
    manualThermalVoltage: true,
    relativePermittivity: 24.2,
  });
  const tdcSettings = {
    timeColumn: 0,
    currentColumn: 1,
    timeUnit: "us",
    currentUnit: "mA",
    invertCurrent: true,
    useAdjacentPairs: false,
    integrationMode: "return-spike",
    baselineMode: "manual",
    manualBaseline: 0,
    integrationStart: NaN,
    integrationEnd: NaN,
    excludeSpikeUs: 0,
    smoothData: false,
    smoothWindow: 5,
  };

  expectedTdcN0Cm3.forEach((expectedN0, index) => {
    const fileName = `${index}.txt`;
    const parsedTdc = parseData(fs.readFileSync(path.join(tdcFixtureDir, fileName), "utf8"), fileName);
    assert.equal(parsedTdc.errors.length, 0);
    const [tdcTrace] = buildTraces([parsedTdc], tdcSettings);
    const processedTdc = processTrace(tdcTrace, tdcSettings);
    const [tdcResult] = computeResults([processedTdc], tdcInputs, [NaN]);
    const errorPct = Math.abs((tdcResult.n0Cm3 - expectedN0) / expectedN0) * 100;
    assert.ok(errorPct < 1.5, `${fileName} TDC N0 error ${errorPct.toFixed(3)}%`);
    assert.equal(processedTdc.integration.startIndex, processedTdc.edges.returnSpikeIndex);
    assert.equal(processedTdc.baseline.mode, "return-spike zero baseline");
  });
}

console.log(`Synthetic validation error: ${errorPct.toFixed(3)}%`);
console.log("Calculator validation tests passed.");
