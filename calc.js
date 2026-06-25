export const APP_CONFIG = {
  version: "v0.1 public-beta",
  methodVersion: "tdc-return-spike-peak-v6",
  constants: {
    q: 1.602176634e-19,
    eps0: 8.854187817e-12,
    kB: 1.380649e-23,
  },
  ranges: {
    areaM2: { min: 1e-8, max: 1e-2 },
    thicknessM: { min: 1e-8, max: 5e-5 },
    epsr: { min: 5, max: 80 },
    n0Cm3: { min: 1e12, max: 1e21 },
    mobilityCm2Vs: { min: 1e-12, max: 1e2 },
  },
};

export const unitFactors = {
  time: { s: 1, ms: 1e-3, us: 1e-6 },
  current: { A: 1, mA: 1e-3, uA: 1e-6 },
  thickness: { m: 1, cm: 1e-2, um: 1e-6, nm: 1e-9 },
  area: { m2: 1, cm2: 1e-4, mm2: 1e-6 },
};

export function thermalVoltageFromTemperature(value, unit = "K") {
  const kelvin = unit === "C" ? value + 273.15 : value;
  return (APP_CONFIG.constants.kB * kelvin) / APP_CONFIG.constants.q;
}

export function convertInputsToSI(input) {
  const temperatureK = input.temperatureUnit === "C" ? input.temperature + 273.15 : input.temperature;
  const thermalVoltage = input.manualThermalVoltage
    ? input.thermalVoltage
    : thermalVoltageFromTemperature(input.temperature, input.temperatureUnit);
  return {
    thicknessM: input.thickness * unitFactors.thickness[input.thicknessUnit],
    areaM2: input.area * unitFactors.area[input.areaUnit],
    preloadBiasV: input.preloadBias,
    builtInPotentialV: input.builtInPotential,
    temperatureK,
    thermalVoltageV: thermalVoltage,
    relativePermittivity: input.relativePermittivity,
    notes: input.notes || "",
  };
}

export function detectDelimiter(line) {
  const candidates = [
    { name: "tab", regex: /\t+/ },
    { name: "comma", regex: /,+/ },
    { name: "semicolon", regex: /;+/ },
    { name: "whitespace", regex: /\s+/ },
  ];
  let best = candidates[0];
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = line.trim().split(candidate.regex).length;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function splitWithDelimiter(line, delimiter) {
  return line.trim().split(delimiter.regex).filter((part) => part.length > 0);
}

function numericCells(parts) {
  return parts.map((part) => Number(part.trim())).filter((value) => Number.isFinite(value));
}

export function parseData(text, fileName = "uploaded file") {
  const allLines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const headerText = allLines.slice(0, 30).join(" ");
  const legacyUnitHints = {
    timeUnit: /\bTime\s*\(\s*s\s*\)/i.test(headerText) ? "s" : /\bTime\s*\(\s*ms\s*\)/i.test(headerText) ? "ms" : /\bTime\s*\(\s*(u|µ)s\s*\)/i.test(headerText) ? "us" : null,
    currentUnit: /\bCurrent\s*\(\s*A\s*\)/i.test(headerText) ? "A" : /\bCurrent\s*\(\s*mA\s*\)/i.test(headerText) ? "mA" : /\bCurrent\s*\(\s*(u|µ)A\s*\)/i.test(headerText) ? "uA" : null,
  };
  const microPrefix = "(?:u|\\u00b5|\\u03bc|\\u00c2\\u00b5)";
  const timeHeader = headerText.match(new RegExp(`\\b(?:Time|t)\\s*\\(\\s*(s|ms|${microPrefix}s)\\s*\\)`, "i"));
  const currentHeader = headerText.match(new RegExp(`\\bCurrent\\b.{0,80}?(?:\\(|\\[)\\s*(A|mA|${microPrefix}A)\\b`, "i"));
  const normalizeUnit = (unit) => unit?.replace(/\u00c2\u00b5|\u00b5|\u03bc/gi, "u").toLowerCase();
  const timeToken = normalizeUnit(timeHeader?.[1]);
  const currentToken = normalizeUnit(currentHeader?.[1]);
  const unitHints = {
    timeUnit: timeToken === "s" ? "s" : timeToken === "ms" ? "ms" : timeToken === "us" ? "us" : legacyUnitHints.timeUnit,
    currentUnit: currentToken === "a" ? "A" : currentToken === "ma" ? "mA" : currentToken === "ua" ? "uA" : legacyUnitHints.currentUnit,
  };
  const dataMarker = allLines.findIndex((line) => line.includes("### Data:"));
  const candidateLines = allLines.slice(dataMarker >= 0 ? dataMarker + 1 : 0).filter((line) => line.trim().length > 0);
  const firstNumericLine = candidateLines.find((line) => numericCells(splitWithDelimiter(line, detectDelimiter(line))).length >= 2);
  if (!firstNumericLine) {
    return {
      fileName,
      delimiter: "unknown",
      columns: [],
      rows: [],
      preview: [],
      removedRows: candidateLines.length,
      unitHints,
      errors: ["No numeric two-column data were found."],
    };
  }

  const delimiter = detectDelimiter(firstNumericLine);
  const rows = [];
  let removedRows = 0;
  let columnCount = 0;

  for (const line of candidateLines) {
    const parts = splitWithDelimiter(line, delimiter);
    const values = parts.map((part) => Number(part.trim()));
    if (values.length >= 2 && values.every((value) => Number.isFinite(value))) {
      columnCount = Math.max(columnCount, values.length);
      rows.push(values);
    } else {
      removedRows += 1;
    }
  }

  const columns = Array.from({ length: columnCount }, (_, index) => `Column ${index + 1}`);
  return {
    fileName,
    delimiter: delimiter.name,
    columns,
    rows,
    preview: rows.slice(0, 5),
    removedRows,
    unitHints,
    errors: rows.length ? [] : ["No valid numeric rows remained after parsing."],
  };
}

export function buildTraces(parsedFiles, settings) {
  const traces = [];
  for (const parsed of parsedFiles) {
    if (!parsed.rows.length) continue;
    const maxCols = parsed.columns.length;
    const pairs = [];
    if (settings.useAdjacentPairs && maxCols >= 2 && maxCols % 2 === 0) {
      for (let col = 0; col < maxCols; col += 2) pairs.push([col, col + 1]);
    } else {
      pairs.push([settings.timeColumn, settings.currentColumn]);
    }

    pairs.forEach(([timeCol, currentCol], pairIndex) => {
      const points = [];
      let nonNumericRemoved = 0;
      for (const row of parsed.rows) {
        const timeRaw = row[timeCol];
        const currentRaw = row[currentCol];
        if (!Number.isFinite(timeRaw) || !Number.isFinite(currentRaw)) {
          nonNumericRemoved += 1;
          continue;
        }
        const current = currentRaw * unitFactors.current[settings.currentUnit] * (settings.invertCurrent ? -1 : 1);
        points.push({
          time: timeRaw * unitFactors.time[settings.timeUnit],
          current,
        });
      }
      traces.push({
        id: `${parsed.fileName}-${pairIndex + 1}`,
        fileName: parsed.fileName,
        deviceId: pairs.length > 1 ? `Device ${pairIndex + 1}` : parsed.fileName.replace(/\.[^.]+$/, ""),
        timeColumn: timeCol,
        currentColumn: currentCol,
        delimiter: parsed.delimiter,
        removedRows: parsed.removedRows + nonNumericRemoved,
        raw: points,
      });
    });
  }
  return traces;
}

export function detectPulseEdges(points) {
  if (points.length < 3) return { pulseStartIndex: 0, pulseEndIndex: Math.max(0, points.length - 1), confidence: "low" };

  const absCurrents = points.map((point) => Math.abs(point.current));
  const sortedAbs = [...absCurrents].sort((a, b) => a - b);
  const medianAbs = sortedAbs[Math.floor(sortedAbs.length / 2)] || 0;
  const maxAbs = Math.max(...absCurrents);
  const maxIndex = absCurrents.indexOf(maxAbs);
  const afterMax = absCurrents[maxIndex + 1] ?? 0;
  const beforeMax = absCurrents[maxIndex - 1] ?? 0;
  const isolatedFirstSpike = maxIndex > 0 &&
    maxIndex < points.length - 2 &&
    maxAbs > Math.max(medianAbs * 25, afterMax * 5, beforeMax * 5);
  if (isolatedFirstSpike) {
    const startIndex = Math.min(points.length - 1, maxIndex + 1);
    const tailWindowEnd = Math.min(points.length, startIndex + Math.max(12, Math.floor(points.length * 0.1)));
    const tailAbs = absCurrents.slice(startIndex, tailWindowEnd).filter((value) => Number.isFinite(value));
    const sortedTail = [...tailAbs].sort((a, b) => a - b);
    const tailMedian = sortedTail[Math.floor(sortedTail.length / 2)] || medianAbs || maxAbs;
    let endIndex = points.length - 1;
    let returnSpikeIndex = null;
    for (let i = startIndex + 3; i < points.length - 1; i += 1) {
      const isLargeReturnSpike = absCurrents[i] > Math.max(maxAbs * 0.1, tailMedian * 8);
      const isIsolated = absCurrents[i] > (absCurrents[i - 1] || 0) * 4 && absCurrents[i] > (absCurrents[i + 1] || 0) * 4;
      if (isLargeReturnSpike && isIsolated) {
        returnSpikeIndex = i;
        endIndex = Math.max(startIndex, i - 1);
        break;
      }
    }
    return {
      pulseStartIndex: startIndex,
      pulseEndIndex: endIndex,
      confidence: "spike-auto",
      electronicSpikeIndex: maxIndex,
      returnSpikeIndex,
    };
  }

  let legacyIndex = -1;
  for (let i = 2; i < points.length; i += 1) {
    const workbookRow = i + 1;
    const c0 = points[i].current;
    const c1 = points[i - 1].current;
    const c2 = points[i - 2].current;
    const legacyEarly = workbookRow > 1590 && workbookRow < 1600 && c0 > 0 && c1 > 0 && c2 > 0;
    const legacyLate = workbookRow > 2632 && c0 > 0;
    if (legacyEarly || legacyLate) {
      legacyIndex = Math.max(0, i - 1);
      break;
    }
  }
  if (legacyIndex >= 0) return { pulseStartIndex: legacyIndex, pulseEndIndex: points.length - 1, confidence: "legacy" };

  let bestIndex = 1;
  let bestJump = 0;
  for (let i = 1; i < points.length; i += 1) {
    const jump = Math.abs(points[i].current - points[i - 1].current);
    if (jump > bestJump) {
      bestJump = jump;
      bestIndex = i;
    }
  }
  return { pulseStartIndex: bestIndex, pulseEndIndex: points.length - 1, confidence: bestJump > 0 ? "auto" : "low" };
}

export function detectReturnSpike(points, edges) {
  if (points.length < 3) return null;
  if (Number.isInteger(edges.returnSpikeIndex)) return edges.returnSpikeIndex;

  const currents = points.map((point) => point.current);
  const jumps = [];
  for (let i = 1; i < currents.length; i += 1) {
    const jump = Math.abs(currents[i] - currents[i - 1]);
    if (Number.isFinite(jump)) jumps.push(jump);
  }
  const sortedJumps = [...jumps].sort((a, b) => a - b);
  const medianJump = sortedJumps[Math.floor(sortedJumps.length / 2)] || 0;
  const minCurrent = Math.min(...currents);
  const maxCurrent = Math.max(...currents);
  const range = Math.max(0, maxCurrent - minCurrent);
  const minProminence = Math.max(medianJump * 8, range * 0.05);
  const startIndex = edges.confidence?.startsWith("spike-auto")
    ? Math.min(points.length - 2, Math.max(edges.pulseStartIndex + 3, 1))
    : 1;
  const candidates = [];

  for (let i = startIndex; i < points.length - 1; i += 1) {
    const previous = currents[i - 1];
    const current = currents[i];
    const next = currents[i + 1];
    const incomingJump = Math.abs(current - previous);
    const recoveryJump = Math.abs(next - current);
    const isLocalReturn = (current <= previous && current <= next) || (current >= previous && current >= next);
    const changesSign = previous * current <= 0 || current * next <= 0;
    const isProminent = incomingJump >= minProminence || (changesSign && incomingJump >= medianJump * 4);
    if (isLocalReturn && isProminent) {
      const score = incomingJump + recoveryJump * 0.5 + (changesSign ? range : 0);
      candidates.push({ index: i, score });
    }
  }

  if (candidates.length) {
    const bestScore = Math.max(...candidates.map((candidate) => candidate.score));
    const prominentCandidates = candidates.filter((candidate) => candidate.score >= bestScore * 0.1);
    return prominentCandidates.at(-1).index;
  }

  let bestIndex = -1;
  let bestJump = 0;
  for (let i = startIndex; i < points.length - 1; i += 1) {
    const jump = Math.abs(points[i].current - points[i - 1].current);
    if (jump > bestJump) {
      bestJump = jump;
      bestIndex = i;
    }
  }
  return bestIndex >= 0 ? bestIndex : null;
}

export function movingAverage(points, windowSize) {
  const width = Math.max(1, Math.floor(windowSize));
  if (width <= 1) return points.map((point) => ({ ...point }));
  return points.map((point, index) => {
    const start = Math.max(0, index - Math.floor(width / 2));
    const end = Math.min(points.length - 1, index + Math.floor(width / 2));
    const subset = points.slice(start, end + 1);
    const current = subset.reduce((sum, item) => sum + item.current, 0) / subset.length;
    return { ...point, current };
  });
}

function mean(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

export function computeBaseline(points, startIndex, endIndex, settings) {
  if (settings.baselineMode === "manual") {
    return {
      mode: "manual",
      valueAt: () => settings.manualBaseline,
      displayValue: settings.manualBaseline,
    };
  }
  if (settings.baselineMode === "pre") {
    const value = mean(points.slice(0, Math.max(1, startIndex)).map((point) => point.current));
    return { mode: "pre-pulse mean", valueAt: () => value, displayValue: value };
  }
  if (settings.baselineMode === "post") {
    const value = mean(points.slice(Math.min(points.length - 1, endIndex + 1)).map((point) => point.current));
    return { mode: "post-window mean", valueAt: () => value, displayValue: value };
  }
  const pre = mean(points.slice(0, Math.max(1, startIndex)).map((point) => point.current));
  const post = mean(points.slice(Math.min(points.length - 1, endIndex + 1)).map((point) => point.current));
  const t0 = points[startIndex]?.time ?? points[0]?.time ?? 0;
  const t1 = points[endIndex]?.time ?? points[points.length - 1]?.time ?? t0 + 1;
  return {
    mode: "linear baseline",
    displayValue: (pre + post) / 2,
    valueAt: (time) => {
      const fraction = t1 === t0 ? 0 : (time - t0) / (t1 - t0);
      return pre + fraction * (post - pre);
    },
  };
}

export function integrateIonicCharge(points) {
  let charge = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    charge += 0.5 * (points[i].current + points[i + 1].current) * (points[i + 1].time - points[i].time);
  }
  return charge;
}

function processReturnSpikeTrace(trace, source, edges, processingSettings) {
  const returnSpikeIndex = detectReturnSpike(source, edges);
  const hasManualStart = Number.isFinite(processingSettings.integrationStart);
  const hasManualEnd = Number.isFinite(processingSettings.integrationEnd);
  if (!Number.isInteger(returnSpikeIndex) && !(hasManualStart && hasManualEnd)) {
    return processTraceStandard(trace, source, edges, processingSettings);
  }

  const peakIndex = Number.isInteger(returnSpikeIndex) ? returnSpikeIndex : 0;
  let startTime = hasManualStart
    ? processingSettings.integrationStart
    : source[peakIndex].time;
  const spikeExclusionS = (processingSettings.excludeSpikeUs || 0) * 1e-6;
  startTime += spikeExclusionS;
  const requestedEndTime = hasManualEnd
    ? processingSettings.integrationEnd
    : source[source.length - 1]?.time ?? startTime;

  const startIndexRaw = source.findIndex((point) => point.time >= startTime);
  const requestedStartIndex = startIndexRaw >= 0 ? startIndexRaw : source.length - 1;
  const startIndex = hasManualStart ? Math.max(0, requestedStartIndex) : Math.max(peakIndex, requestedStartIndex);
  const endIndexRaw = source.findIndex((point) => point.time > requestedEndTime);
  const endIndex = endIndexRaw >= 0 ? Math.max(startIndex, endIndexRaw - 1) : source.length - 1;
  const actualStartTime = source[startIndex]?.time ?? startTime;
  const endTime = source[endIndex]?.time ?? requestedEndTime;
  const windowPoints = source.slice(startIndex, endIndex + 1);
  const signReferenceIndex = Number.isInteger(returnSpikeIndex) ? returnSpikeIndex : startIndex;
  const peakSign = source[signReferenceIndex]?.current < 0 ? -1 : 1;
  const baselineValue = 0;
  const processed = windowPoints.map((point) => {
    const orientedCurrent = point.current * peakSign;
    return {
      time: point.time,
      current: orientedCurrent - baselineValue,
      baseline: baselineValue * peakSign,
      originalCurrent: point.current,
    };
  });
  const qIonC = integrateIonicCharge(processed);
  return {
    ...trace,
    points: source,
    processed,
    edges: { ...edges, returnSpikeIndex, confidence: `${edges.confidence}-return` },
    integration: {
      mode: "return-spike",
      startTime: actualStartTime,
      endTime,
      duration: Math.max(0, endTime - actualStartTime),
      startIndex,
      endIndex,
    },
    baseline: {
      mode: "return-spike zero baseline",
      displayValue: baselineValue * peakSign,
    },
    qIonC,
  };
}

function processTraceStandard(trace, source, edges, processingSettings) {
  const integrationMode = processingSettings.integrationMode || "slow-window";
  const defaultEnd = integrationMode === "full-window"
    ? source[source.length - 1]?.time
    : source[edges.pulseEndIndex]?.time;
  let startTime = Number.isFinite(processingSettings.integrationStart)
    ? processingSettings.integrationStart
    : source[edges.pulseStartIndex]?.time ?? source[0]?.time ?? 0;
  const spikeExclusionS = (processingSettings.excludeSpikeUs || 0) * 1e-6;
  startTime += spikeExclusionS;
  const endTime = Number.isFinite(processingSettings.integrationEnd)
    ? processingSettings.integrationEnd
    : defaultEnd ?? source[source.length - 1]?.time ?? startTime;

  const startIndex = Math.max(0, source.findIndex((point) => point.time >= startTime));
  const endIndexRaw = source.findIndex((point) => point.time > endTime);
  const endIndex = endIndexRaw >= 0 ? Math.max(startIndex, endIndexRaw - 1) : source.length - 1;
  const baseline = computeBaseline(source, startIndex, endIndex, processingSettings);
  const windowPoints = source.slice(startIndex, endIndex + 1);
  const processed = windowPoints.map((point) => ({
    time: point.time,
    current: point.current - baseline.valueAt(point.time),
    baseline: baseline.valueAt(point.time),
    originalCurrent: point.current,
  }));
  const qIonC = integrateIonicCharge(processed);
  return {
    ...trace,
    points: source,
    processed,
    edges,
    integration: {
      mode: integrationMode,
      startTime,
      endTime,
      duration: Math.max(0, endTime - startTime),
      startIndex,
      endIndex,
    },
    baseline: {
      mode: baseline.mode,
      displayValue: baseline.displayValue,
    },
    qIonC,
  };
}

export function processTrace(trace, processingSettings) {
  const sorted = trace.raw.map((point) => ({ ...point }));
  const source = processingSettings.smoothData ? movingAverage(sorted, processingSettings.smoothWindow) : sorted;
  const edges = detectPulseEdges(source);
  if (processingSettings.integrationMode === "return-spike") {
    return processReturnSpikeTrace(trace, source, edges, processingSettings);
  }
  return processTraceStandard(trace, source, edges, processingSettings);
}

export function computeBiasCorrectionFactor(params) {
  return Math.sqrt(1 + 16 * (params.builtInPotentialV / params.thermalVoltageV)) -
    Math.sqrt(1 + 16 * ((params.builtInPotentialV - params.preloadBiasV) / params.thermalVoltageV));
}

export function computeIonConcentration(qIonC, params) {
  const factor = computeBiasCorrectionFactor(params);
  const n0M3 = (8 * ((qIonC / params.areaM2 / factor) ** 2)) /
    (APP_CONFIG.constants.q * APP_CONFIG.constants.eps0 * params.relativePermittivity * params.thermalVoltageV);
  return { n0M3, n0Cm3: n0M3 / 1e6, factor };
}

export function computeConductivity(thicknessM, areaM2, resistanceOhm) {
  return thicknessM / (areaM2 * resistanceOhm);
}

export function computeMobility(conductivitySm, n0M3) {
  return conductivitySm / (APP_CONFIG.constants.q * n0M3);
}

export function computeResults(processedTraces, params, resistances) {
  return processedTraces.map((trace, index) => {
    const concentration = computeIonConcentration(trace.qIonC, params);
    const resistanceOhm = resistances[index];
    const hasResistance = Number.isFinite(resistanceOhm) && resistanceOhm > 0;
    const conductivitySm = hasResistance ? computeConductivity(params.thicknessM, params.areaM2, resistanceOhm) : null;
    const mobilityM2Vs = conductivitySm ? computeMobility(conductivitySm, concentration.n0M3) : null;
    return {
      traceId: trace.id,
      deviceId: trace.deviceId,
      sourceFile: trace.fileName,
      qIonC: trace.qIonC,
      qArealCm2: trace.qIonC / params.areaM2 / 1e4,
      qArealM2: trace.qIonC / params.areaM2,
      n0M3: concentration.n0M3,
      n0Cm3: concentration.n0Cm3,
      biasCorrectionFactor: concentration.factor,
      resistanceOhm: hasResistance ? resistanceOhm : null,
      conductivitySm,
      conductivityScm: conductivitySm === null ? null : conductivitySm / 100,
      mobilityM2Vs,
      mobilityCm2Vs: mobilityM2Vs === null ? null : mobilityM2Vs * 1e4,
      integration: trace.integration,
      baselineMode: trace.baseline.mode,
      baselineValueA: trace.baseline.displayValue,
    };
  });
}

function warning(severity, message, traceId = "global") {
  return { severity, message, traceId };
}

export function runSanityChecks(parsedFiles, traces, processedTraces, results, params, resistances) {
  const warnings = [];
  if (!parsedFiles.length) warnings.push(warning("critical", "No files have been loaded."));
  if (!Number.isFinite(params.areaM2) || params.areaM2 <= 0) warnings.push(warning("critical", "Active area is missing or invalid."));
  if (!Number.isFinite(params.thicknessM) || params.thicknessM <= 0) warnings.push(warning("critical", "Thickness is missing or invalid."));
  if (params.areaM2 < APP_CONFIG.ranges.areaM2.min || params.areaM2 > APP_CONFIG.ranges.areaM2.max) warnings.push(warning("warning", "Active area is outside the configured typical range."));
  if (params.thicknessM < APP_CONFIG.ranges.thicknessM.min || params.thicknessM > APP_CONFIG.ranges.thicknessM.max) warnings.push(warning("warning", "Thickness is outside the configured typical range."));
  if (params.relativePermittivity < APP_CONFIG.ranges.epsr.min || params.relativePermittivity > APP_CONFIG.ranges.epsr.max) warnings.push(warning("warning", "Relative permittivity is outside the configured typical range."));

  parsedFiles.forEach((parsed) => {
    if (parsed.removedRows > 0) warnings.push(warning("info", `${parsed.fileName}: ${parsed.removedRows} non-numeric rows were ignored.`));
    parsed.errors.forEach((error) => warnings.push(warning("critical", `${parsed.fileName}: ${error}`)));
  });

  traces.forEach((trace) => {
    const times = trace.raw.map((point) => point.time);
    const duplicate = times.some((time, index) => index > 0 && time === times[index - 1]);
    const monotonic = times.every((time, index) => index === 0 || time > times[index - 1]);
    if (!monotonic) warnings.push(warning("critical", `${trace.deviceId}: time column is not strictly monotonic.`, trace.id));
    if (duplicate) warnings.push(warning("warning", `${trace.deviceId}: duplicate time points detected.`, trace.id));
  });

  processedTraces.forEach((trace) => {
    if (trace.edges.confidence === "low") warnings.push(warning("warning", `${trace.deviceId}: no clear pulse edge detected.`, trace.id));
    if (trace.integration.duration <= 0 || trace.processed.length < 2) warnings.push(warning("critical", `${trace.deviceId}: integration window is empty or too short.`, trace.id));
    if (trace.integration.startIndex <= trace.edges.pulseStartIndex) warnings.push(warning("warning", `${trace.deviceId}: integration window may include the fast electronic spike.`, trace.id));
    if (trace.qIonC < 0) warnings.push(warning("warning", `${trace.deviceId}: calculated charge integral is negative; verify current sign and baseline.`, trace.id));
    const absTail = Math.abs(trace.points.at(-1)?.current ?? 0);
    const absPeak = Math.max(...trace.points.map((point) => Math.abs(point.current)), 0);
    if (absPeak > 0 && absTail / absPeak > 0.25) warnings.push(warning("warning", `${trace.deviceId}: current does not return near baseline.`, trace.id));
  });

  results.forEach((result, index) => {
    if (!Number.isFinite(result.n0Cm3) || result.n0Cm3 <= 0) warnings.push(warning("critical", `${result.deviceId}: concentration is invalid.`, result.traceId));
    if (result.n0Cm3 < APP_CONFIG.ranges.n0Cm3.min || result.n0Cm3 > APP_CONFIG.ranges.n0Cm3.max) warnings.push(warning("warning", `${result.deviceId}: N0 is outside the configured PSC range.`, result.traceId));
    if (!Number.isFinite(resistances[index]) || resistances[index] <= 0) warnings.push(warning("info", `${result.deviceId}: ionic resistance is missing, so conductivity and mobility are not calculated.`, result.traceId));
    if (result.mobilityCm2Vs !== null && (result.mobilityCm2Vs < APP_CONFIG.ranges.mobilityCm2Vs.min || result.mobilityCm2Vs > APP_CONFIG.ranges.mobilityCm2Vs.max)) {
      warnings.push(warning("warning", `${result.deviceId}: mobility is outside the configured order-of-magnitude range.`, result.traceId));
    }
  });
  return warnings;
}

function pctChange(base, next) {
  if (!Number.isFinite(base) || base === 0 || !Number.isFinite(next)) return null;
  return ((next - base) / Math.abs(base)) * 100;
}

export function runSensitivityAnalysis(primaryTrace, primaryResult, params) {
  if (!primaryTrace || !primaryResult) return [];
  const qBase = primaryResult.qIonC;
  const nBase = primaryResult.n0M3;
  const sigmaBase = primaryResult.conductivitySm;
  const muBase = primaryResult.mobilityM2Vs;
  const nAreaUp = computeIonConcentration(qBase, { ...params, areaM2: params.areaM2 * 1.1 }).n0M3;
  const nAreaDown = computeIonConcentration(qBase, { ...params, areaM2: params.areaM2 * 0.9 }).n0M3;
  const sigmaThickUp = primaryResult.resistanceOhm ? computeConductivity(params.thicknessM * 1.1, params.areaM2, primaryResult.resistanceOhm) : null;
  const sigmaRUp = primaryResult.resistanceOhm ? computeConductivity(params.thicknessM, params.areaM2, primaryResult.resistanceOhm * 1.1) : null;
  const trimmed = primaryTrace.processed.slice(1, Math.max(1, primaryTrace.processed.length - 1));
  const qTrim = trimmed.length > 1 ? integrateIonicCharge(trimmed) : qBase;
  const baselineOffset = mean(primaryTrace.processed.map((point) => Math.abs(point.current))) * 0.1;
  const shifted = primaryTrace.processed.map((point) => ({ ...point, current: point.current - baselineOffset }));
  const qBaseline = shifted.length > 1 ? integrateIonicCharge(shifted) : qBase;
  return [
    { assumption: "Area +10%", n0Pct: pctChange(nBase, nAreaUp), sigmaPct: pctChange(sigmaBase, sigmaBase ? sigmaBase / 1.1 : null), mobilityPct: pctChange(muBase, muBase ? muBase / 1.1 : null) },
    { assumption: "Area -10%", n0Pct: pctChange(nBase, nAreaDown), sigmaPct: pctChange(sigmaBase, sigmaBase ? sigmaBase / 0.9 : null), mobilityPct: pctChange(muBase, muBase ? muBase / 0.9 : null) },
    { assumption: "Thickness +10%", n0Pct: 0, sigmaPct: pctChange(sigmaBase, sigmaThickUp), mobilityPct: pctChange(muBase, sigmaThickUp && nBase ? computeMobility(sigmaThickUp, nBase) : null) },
    { assumption: "Resistance +10%", n0Pct: 0, sigmaPct: pctChange(sigmaBase, sigmaRUp), mobilityPct: pctChange(muBase, sigmaRUp && nBase ? computeMobility(sigmaRUp, nBase) : null) },
    { assumption: "Trim one sample each side", n0Pct: pctChange(nBase, computeIonConcentration(qTrim, params).n0M3), sigmaPct: 0, mobilityPct: pctChange(muBase, primaryResult.conductivitySm ? computeMobility(primaryResult.conductivitySm, computeIonConcentration(qTrim, params).n0M3) : null) },
    { assumption: "Baseline +10% mean current", n0Pct: pctChange(nBase, computeIonConcentration(qBaseline, params).n0M3), sigmaPct: 0, mobilityPct: pctChange(muBase, primaryResult.conductivitySm ? computeMobility(primaryResult.conductivitySm, computeIonConcentration(qBaseline, params).n0M3) : null) },
  ];
}

export function generateSyntheticSample() {
  const rows = [];
  const dt = 2e-5;
  const baseline = 0;
  const amp = 2e-4;
  const tau = 2e-4;
  const start = 0.001;
  const end = 0.0022;
  for (let i = 0; i < 170; i += 1) {
    const time = i * dt;
    const tail = time >= start && time <= end ? -amp * Math.exp(-(time - start) / tau) : 0;
    rows.push([time, tail + baseline]);
  }
  const expectedQ = amp * tau * (1 - Math.exp(-(end - start) / tau));
  return {
    fileName: "synthetic-validation.csv",
    text: rows.map((row) => row.join(",")).join("\n"),
    expectedQ,
    settings: { timeUnit: "s", currentUnit: "A", invertCurrent: true, integrationStart: start, integrationEnd: end },
  };
}

export function generateExperimentalSample() {
  const rows = [];
  for (let i = 0; i < 2700; i += 1) {
    const timeUs = -3100 + i * 5.2;
    const tail = i > 2632 ? -0.16 * Math.exp(-(i - 2632) / 8) : 0.00003 * Math.sin(i / 7);
    rows.push(`${timeUs.toExponential(7)}\t${tail.toExponential(7)}`);
  }
  return {
    fileName: "experimental-style-sample.txt",
    text: `### Synthetic experimental-style DIT export\n### Data:\n${rows.join("\n")}`,
  };
}

export function generateExportReport(context) {
  return {
    timestamp: new Date().toISOString(),
    appVersion: APP_CONFIG.version,
    methodVersion: APP_CONFIG.methodVersion,
    privacy: "Processed locally in the browser by this static deployment.",
    inputs: context.inputs,
    processingSettings: context.processingSettings,
    parsedFiles: context.parsedFiles.map((file) => ({
      fileName: file.fileName,
      delimiter: file.delimiter,
      rows: file.rows.length,
      columns: file.columns.length,
      removedRows: file.removedRows,
    })),
    results: context.results,
    warnings: context.warnings,
    sensitivity: context.sensitivity,
    validation: context.validation,
  };
}

export function summarize(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return { mean: null, sd: null, min: null, max: null, n: 0 };
  const avg = mean(finite);
  const variance = finite.reduce((sum, value) => sum + (value - avg) ** 2, 0) / Math.max(1, finite.length - 1);
  return {
    mean: avg,
    sd: Math.sqrt(variance),
    min: Math.min(...finite),
    max: Math.max(...finite),
    n: finite.length,
  };
}
