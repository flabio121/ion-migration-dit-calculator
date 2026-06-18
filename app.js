import {
  APP_CONFIG,
  buildTraces,
  computeResults,
  convertInputsToSI,
  generateExperimentalSample,
  generateExportReport,
  generateSyntheticSample,
  parseData,
  processTrace,
  runSanityChecks,
  runSensitivityAnalysis,
  summarize,
  thermalVoltageFromTemperature,
} from "./calc.js?v=20260616-manual-window-overlay";

const state = {
  files: [],
  parsedFiles: [],
  traces: [],
  processedTraces: [],
  results: [],
  warnings: [],
  sensitivity: [],
  validation: null,
  report: null,
  plotMode: "processed",
};

const plotColors = ["#0e7c86", "#a23b72", "#2f6f3e", "#c05a28", "#4d5f9f", "#8a6b12", "#287cba", "#7b4ea3", "#3d776d", "#b3434a"];

const els = {
  versionTag: document.getElementById("versionTag"),
  fileInput: document.getElementById("fileInput"),
  dropZone: document.getElementById("dropZone"),
  fileName: document.getElementById("fileName"),
  thickness: document.getElementById("thickness"),
  thicknessUnit: document.getElementById("thicknessUnit"),
  area: document.getElementById("area"),
  areaUnit: document.getElementById("areaUnit"),
  preloadBias: document.getElementById("preloadBias"),
  builtInPotential: document.getElementById("builtInPotential"),
  temperature: document.getElementById("temperature"),
  temperatureUnit: document.getElementById("temperatureUnit"),
  thermalVoltage: document.getElementById("thermalVoltage"),
  manualThermalVoltage: document.getElementById("manualThermalVoltage"),
  relativePermittivity: document.getElementById("relativePermittivity"),
  sampleNotes: document.getElementById("sampleNotes"),
  parseSummary: document.getElementById("parseSummary"),
  previewTable: document.getElementById("previewTable"),
  timeColumn: document.getElementById("timeColumn"),
  currentColumn: document.getElementById("currentColumn"),
  timeUnit: document.getElementById("timeUnit"),
  currentUnit: document.getElementById("currentUnit"),
  invertCurrent: document.getElementById("invertCurrent"),
  showCurrentDensity: document.getElementById("showCurrentDensity"),
  showIntegrationRegion: document.getElementById("showIntegrationRegion"),
  useAdjacentPairs: document.getElementById("useAdjacentPairs"),
  integrationMode: document.getElementById("integrationMode"),
  baselineMode: document.getElementById("baselineMode"),
  manualBaseline: document.getElementById("manualBaseline"),
  integrationStart: document.getElementById("integrationStart"),
  integrationEnd: document.getElementById("integrationEnd"),
  excludeSpike: document.getElementById("excludeSpike"),
  smoothData: document.getElementById("smoothData"),
  smoothWindow: document.getElementById("smoothWindow"),
  resetProcessing: document.getElementById("resetProcessing"),
  measurementCount: document.getElementById("measurementCount"),
  pointCount: document.getElementById("pointCount"),
  biasCorrectionFactor: document.getElementById("biasCorrectionFactor"),
  ditChart: document.getElementById("ditChart"),
  plotSummary: document.getElementById("plotSummary"),
  plotLegend: document.getElementById("plotLegend"),
  resultCards: document.getElementById("resultCards"),
  warningsList: document.getElementById("warningsList"),
  sensitivityTable: document.getElementById("sensitivityTable"),
  resistanceList: document.getElementById("resistanceList"),
  addResistance: document.getElementById("addResistance"),
  exportWithWarnings: document.getElementById("exportWithWarnings"),
  exportCsv: document.getElementById("exportCsv"),
  exportJson: document.getElementById("exportJson"),
  exportPng: document.getElementById("exportPng"),
  resultsBody: document.querySelector("#resultsTable tbody"),
  processedTable: document.getElementById("processedTable"),
  rawTable: document.getElementById("rawTable"),
  loadExperimentalSample: document.getElementById("loadExperimentalSample"),
  loadSyntheticSample: document.getElementById("loadSyntheticSample"),
};

function numberFrom(input) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : NaN;
}

function formatNumber(value, digits = 5) {
  if (value === null || value === undefined || value === "" || Number.isNaN(value)) return "--";
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 10000 || abs < 0.001) return value.toExponential(digits);
  return value.toPrecision(digits + 1).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function pct(value) {
  return value === null || value === undefined || Number.isNaN(value) ? "--" : `${formatNumber(value, 2)}%`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function getInputsRaw() {
  return {
    thickness: numberFrom(els.thickness),
    thicknessUnit: els.thicknessUnit.value,
    area: numberFrom(els.area),
    areaUnit: els.areaUnit.value,
    preloadBias: numberFrom(els.preloadBias),
    builtInPotential: numberFrom(els.builtInPotential),
    temperature: numberFrom(els.temperature),
    temperatureUnit: els.temperatureUnit.value,
    thermalVoltage: numberFrom(els.thermalVoltage),
    manualThermalVoltage: els.manualThermalVoltage.checked,
    relativePermittivity: numberFrom(els.relativePermittivity),
    notes: els.sampleNotes.value.trim(),
  };
}

function getProcessingSettings() {
  return {
    timeColumn: Number(els.timeColumn.value || 0),
    currentColumn: Number(els.currentColumn.value || 1),
    timeUnit: els.timeUnit.value,
    currentUnit: els.currentUnit.value,
    invertCurrent: els.invertCurrent.checked,
    showCurrentDensity: els.showCurrentDensity.checked,
    useAdjacentPairs: els.useAdjacentPairs.checked,
    integrationMode: els.integrationMode.value,
    baselineMode: els.baselineMode.value,
    manualBaseline: numberFrom(els.manualBaseline),
    integrationStart: els.integrationStart.value === "" ? NaN : numberFrom(els.integrationStart),
    integrationEnd: els.integrationEnd.value === "" ? NaN : numberFrom(els.integrationEnd),
    excludeSpikeUs: numberFrom(els.excludeSpike),
    smoothData: els.smoothData.checked,
    smoothWindow: numberFrom(els.smoothWindow),
  };
}

function updateThermalVoltage() {
  els.thermalVoltage.disabled = !els.manualThermalVoltage.checked;
  if (!els.manualThermalVoltage.checked) {
    els.thermalVoltage.value = thermalVoltageFromTemperature(numberFrom(els.temperature), els.temperatureUnit.value).toPrecision(6);
  }
}

function ensureResistanceInputs(count) {
  while (els.resistanceList.children.length < count) addResistanceInput();
}

function addResistanceInput(value = "") {
  const index = els.resistanceList.children.length + 1;
  const label = document.createElement("label");
  label.title = "Measured or fitted ionic resistance used to calculate ionic conductivity and mobility.";
  label.innerHTML = `
    Device ${index}
    <span class="input-with-unit">
      <input type="number" step="any" value="${value}" aria-label="Ionic resistance for device ${index}">
      <span>ohm</span>
    </span>
  `;
  label.querySelector("input").addEventListener("input", recalculateSafely);
  els.resistanceList.appendChild(label);
}

function getResistances() {
  return [...els.resistanceList.querySelectorAll("input")].map((input) => Number(input.value));
}

function updateColumnSelectors() {
  const first = state.parsedFiles[0];
  const columns = first?.columns?.length ? first.columns : ["Column 1", "Column 2"];
  const options = columns.map((column, index) => `<option value="${index}">${escapeHtml(column)}</option>`).join("");
  els.timeColumn.innerHTML = options;
  els.currentColumn.innerHTML = options;
  els.timeColumn.value = "0";
  els.currentColumn.value = columns.length > 1 ? "1" : "0";
}

function applyDetectedFileHints() {
  const hints = state.parsedFiles[0]?.unitHints;
  if (hints?.timeUnit) els.timeUnit.value = hints.timeUnit;
  if (hints?.currentUnit) els.currentUnit.value = hints.currentUnit;
}

function inferCurrentSignFromWindow() {
  if (!state.parsedFiles.length) return;
  const baseSettings = {
    ...getProcessingSettings(),
    invertCurrent: false,
  };
  const traces = buildTraces(state.parsedFiles, baseSettings);
  if (!traces.length) return;
  const processed = processTrace(traces[0], {
    ...baseSettings,
    baselineMode: "manual",
    manualBaseline: 0,
    integrationMode: "return-spike",
    integrationStart: NaN,
    integrationEnd: NaN,
  });
  els.invertCurrent.checked = processed.qIonC < 0;
}

function renderPreview() {
  const first = state.parsedFiles[0];
  if (!first) {
    els.parseSummary.textContent = "No data loaded.";
    els.previewTable.innerHTML = "";
    return;
  }
  const totalRows = state.parsedFiles.reduce((sum, file) => sum + file.rows.length, 0);
  els.parseSummary.textContent = `${state.parsedFiles.length} file(s), ${totalRows} numeric rows, ${first.columns.length} detected columns, delimiter: ${first.delimiter}.`;
  const header = `<thead><tr><th>Row</th>${first.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>`;
  const body = `<tbody>${first.preview.map((row, index) => `
    <tr><td>${index + 1}</td>${first.columns.map((_, columnIndex) => `<td>${formatNumber(row[columnIndex])}</td>`).join("")}</tr>
  `).join("")}</tbody>`;
  els.previewTable.innerHTML = header + body;
}

function recalculateSafely() {
  try {
    recalculate();
  } catch (error) {
    state.warnings = [{ severity: "critical", message: error.message, traceId: "global" }];
    renderWarnings();
  }
}

function recalculate() {
  updateThermalVoltage();
  if (!state.files.length) {
    renderEmpty();
    return;
  }
  state.parsedFiles = state.files.map((file) => parseData(file.text, file.name));
  renderPreview();

  const processing = getProcessingSettings();
  const params = convertInputsToSI(getInputsRaw());
  state.traces = buildTraces(state.parsedFiles, processing);
  ensureResistanceInputs(state.traces.length);
  state.processedTraces = state.traces.map((trace) => processTrace(trace, processing));
  state.results = computeResults(state.processedTraces, params, getResistances());
  state.warnings = runSanityChecks(state.parsedFiles, state.traces, state.processedTraces, state.results, params, getResistances());
  state.sensitivity = runSensitivityAnalysis(state.processedTraces[0], state.results[0], params);

  if (state.validation?.expectedQ && state.results[0]) {
    const errorPct = ((state.results[0].qIonC - state.validation.expectedQ) / state.validation.expectedQ) * 100;
    state.validation = {
      ...state.validation,
      calculatedQ: state.results[0].qIonC,
      errorPct,
      passed: Math.abs(errorPct) < 5,
    };
  }

  state.report = generateExportReport({
    inputs: { raw: getInputsRaw(), si: params },
    processingSettings: processing,
    parsedFiles: state.parsedFiles,
    results: state.results,
    warnings: state.warnings,
    sensitivity: state.sensitivity,
    validation: state.validation,
  });
  renderAll();
}

function renderEmpty() {
  els.measurementCount.textContent = "0";
  els.pointCount.textContent = "0";
  els.biasCorrectionFactor.textContent = "--";
  els.resultCards.innerHTML = cardHtml("No data", "Upload DIT files", "Results will appear here.");
  els.resultsBody.innerHTML = '<tr class="empty-row"><td colspan="11">Upload one or more DIT files to calculate results.</td></tr>';
  els.processedTable.innerHTML = "";
  els.rawTable.innerHTML = "";
  els.warningsList.innerHTML = "";
  els.sensitivityTable.innerHTML = "";
  setExportEnabled(false);
  drawPlot();
}

function renderAll() {
  const totalPoints = state.processedTraces.reduce((sum, trace) => sum + trace.processed.length, 0);
  els.measurementCount.textContent = String(state.results.length);
  els.pointCount.textContent = String(totalPoints);
  els.biasCorrectionFactor.textContent = formatNumber(state.results[0]?.biasCorrectionFactor);
  renderCards();
  renderResultsTable();
  renderWarnings();
  renderSensitivity();
  renderMatrixTable(els.processedTable, state.processedTraces.map((trace) => trace.processed), 250, true);
  renderMatrixTable(els.rawTable, state.traces.map((trace) => trace.raw), 250, false);
  drawPlot();
  setExportEnabled(state.results.length > 0);
}

function cardHtml(label, value, detail = "") {
  return `<div class="result-card"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`;
}

function renderCards() {
  const q = summarize(state.results.map((result) => result.qIonC));
  const qa = summarize(state.results.map((result) => result.qArealCm2));
  const n0 = summarize(state.results.map((result) => result.n0Cm3));
  const sigma = summarize(state.results.map((result) => result.conductivityScm).filter((value) => value !== null));
  const mu = summarize(state.results.map((result) => result.mobilityCm2Vs).filter((value) => value !== null));
  const resistance = summarize(state.results.map((result) => result.resistanceOhm).filter((value) => value !== null));
  const window = state.results[0]?.integration;
  const edgeMode = state.processedTraces[0]?.edges.confidence || "--";
  const validation = state.validation
    ? `${state.validation.passed ? "Validation passed" : "Validation check"}: ${formatNumber(state.validation.errorPct, 3)}% error`
    : "Use synthetic validation sample to check integration.";
  els.resultCards.innerHTML = [
    cardHtml("Mobile ion concentration, N0", formatNumber(n0.mean), "cm^-3 mean"),
    cardHtml("Integrated ionic charge, Q ion", formatNumber(q.mean), `C mean, n=${q.n}`),
    cardHtml("Areal charge density", formatNumber(qa.mean), "C/cm^2 mean"),
    cardHtml("Ionic resistance, R ion", formatNumber(resistance.mean), `ohm mean, n=${resistance.n}`),
    cardHtml("Ionic conductivity", formatNumber(sigma.mean), "S/cm mean"),
    cardHtml("Ion mobility", formatNumber(mu.mean), "cm^2/V/s mean"),
    cardHtml("Integration window", window ? `${formatNumber(window.startTime)} to ${formatNumber(window.endTime)} s` : "--", window ? `${formatNumber(window.duration)} s, ${window.mode || "window"} mode` : ""),
    cardHtml("Edge detection", edgeMode, edgeMode.includes("return") ? "Return spike integrated peak to tail with zero baseline." : "Detected from uploaded trace."),
    cardHtml("Baseline method", state.processedTraces[0]?.baseline.mode || "--", `Baseline ${formatNumber(state.processedTraces[0]?.baseline.displayValue)} A`),
    cardHtml("Validation", validation, state.validation?.expectedQ ? `Expected Q ${formatNumber(state.validation.expectedQ)} C` : ""),
  ].join("");
}

function renderResultsTable() {
  if (!state.results.length) {
    els.resultsBody.innerHTML = '<tr class="empty-row"><td colspan="11">No results yet.</td></tr>';
    return;
  }
  els.resultsBody.innerHTML = state.results.map((row) => {
    const traceWarnings = state.warnings.filter((item) => item.traceId === row.traceId);
    return `
      <tr>
        <td>${escapeHtml(row.deviceId)}</td>
        <td>${escapeHtml(row.sourceFile)}</td>
        <td>${formatNumber(row.n0Cm3)}</td>
        <td>${formatNumber(row.resistanceOhm)}</td>
        <td>${formatNumber(row.qIonC)}</td>
        <td>${formatNumber(row.qArealCm2)}</td>
        <td>${formatNumber(row.conductivityScm)}</td>
        <td>${formatNumber(row.mobilityCm2Vs)}</td>
        <td>${escapeHtml(state.processedTraces.find((trace) => trace.id === row.traceId)?.edges.confidence || "--")}</td>
        <td>${formatNumber(row.integration.startTime)}-${formatNumber(row.integration.endTime)} s</td>
        <td>${traceWarnings.length}</td>
      </tr>
    `;
  }).join("");
}

function renderWarnings() {
  if (!state.warnings.length) {
    els.warningsList.innerHTML = '<div class="warning-item info"><span class="warning-badge">info</span><div>No warnings detected.</div></div>';
    return;
  }
  els.warningsList.innerHTML = state.warnings.map((item) => `
    <div class="warning-item ${item.severity}">
      <span class="warning-badge">${item.severity}</span>
      <div>${escapeHtml(item.message)}</div>
    </div>
  `).join("");
}

function renderSensitivity() {
  if (!state.sensitivity.length) {
    els.sensitivityTable.innerHTML = "";
    return;
  }
  els.sensitivityTable.innerHTML = `
    <thead><tr><th>Assumption</th><th>N0 change</th><th>sigma change</th><th>mobility change</th></tr></thead>
    <tbody>${state.sensitivity.map((row) => `
      <tr><td>${escapeHtml(row.assumption)}</td><td>${pct(row.n0Pct)}</td><td>${pct(row.sigmaPct)}</td><td>${pct(row.mobilityPct)}</td></tr>
    `).join("")}</tbody>
  `;
}

function renderMatrixTable(table, series, maxRows, processed) {
  if (!series.length) {
    table.innerHTML = "";
    return;
  }
  const headers = series.flatMap((_, index) => {
    const trace = state.processedTraces[index] || state.traces[index];
    const label = trace ? `${trace.fileName} / ${trace.deviceId}` : `Trace ${index + 1}`;
    return [`${label} time (s)`, `${label} ${processed ? "ionic current (A)" : "current (A)"}`];
  });
  const rowCount = Math.min(maxRows, Math.max(...series.map((points) => points.length)));
  let body = "";
  for (let row = 0; row < rowCount; row += 1) {
    body += "<tr>";
    for (const points of series) {
      const point = points[row];
      body += `<td>${point ? formatNumber(point.time) : ""}</td><td>${point ? formatNumber(point.current) : ""}</td>`;
    }
    body += "</tr>";
  }
  table.innerHTML = `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${body}</tbody>`;
}

function setExportEnabled(enabled) {
  els.exportCsv.disabled = !enabled;
  els.exportJson.disabled = !enabled;
  els.exportPng.disabled = !enabled;
}

function exportAllowed() {
  const hasCritical = state.warnings.some((warning) => warning.severity === "critical");
  if (hasCritical && !els.exportWithWarnings.checked) {
    alert("Critical warnings are present. Review them or select 'Export with critical warnings'.");
    return false;
  }
  return true;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function exportCsv() {
  if (!exportAllowed()) return;
  const rows = [
    ["app_version", APP_CONFIG.version],
    ["timestamp", new Date().toISOString()],
    [],
    ["device_id", "source_file", "n0_cm3", "q_ion_C", "q_areal_C_cm2", "r_ion_ohm", "sigma_S_cm", "mobility_cm2_V_s", "baseline_method", "window_start_s", "window_end_s"],
    ...state.results.map((row) => [row.deviceId, row.sourceFile, row.n0Cm3, row.qIonC, row.qArealCm2, row.resistanceOhm ?? "", row.conductivityScm ?? "", row.mobilityCm2Vs ?? "", row.baselineMode, row.integration.startTime, row.integration.endTime]),
    [],
    ["warnings"],
    ...state.warnings.map((warning) => [warning.severity, warning.traceId, warning.message]),
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "dit-ion-results.csv");
}

function exportJson() {
  if (!exportAllowed()) return;
  downloadBlob(new Blob([JSON.stringify(state.report, null, 2)], { type: "application/json" }), "dit-ion-report.json");
}

function exportPng() {
  if (!exportAllowed()) return;
  els.ditChart.toBlob((blob) => {
    if (blob) downloadBlob(blob, "dit-ion-plot.png");
  });
}

function drawPlot() {
  const canvas = els.ditChart;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = Math.max(320, rect.width || 900);
  const cssHeight = Math.max(300, rect.height || 460);
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const params = state.report?.inputs?.si;
  const densityScale = els.showCurrentDensity.checked && params?.areaM2 ? 0.1 / params.areaM2 : 1;
  const series = (state.plotMode === "raw" ? state.traces.map((trace) => trace.raw) : state.processedTraces.map((trace) => trace.processed))
    .map((points) => points.map((point) => ({ ...point, current: point.current * densityScale })));
  const nonEmpty = series.filter((points) => points.length > 0);
  if (!nonEmpty.length) {
    ctx.fillStyle = "#66727f";
    ctx.font = "14px Segoe UI, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Upload DIT data to view the plot", cssWidth / 2, cssHeight / 2);
    els.plotSummary.textContent = "No data loaded";
    els.plotLegend.innerHTML = "";
    return;
  }

  const all = nonEmpty.flat();
  let minX = Math.min(...all.map((point) => point.time));
  let maxX = Math.max(...all.map((point) => point.time));
  let minY = Math.min(...all.map((point) => point.current));
  let maxY = Math.max(...all.map((point) => point.current));
  if (minX === maxX) [minX, maxX] = [minX - 1, maxX + 1];
  if (minY === maxY) [minY, maxY] = [minY - 1, maxY + 1];
  const yPad = (maxY - minY) * 0.15;
  const xPad = (maxX - minX) * 0.04;
  minX -= xPad;
  maxX += xPad;
  minY -= yPad;
  maxY += yPad;

  const margin = { top: 24, right: 26, bottom: 62, left: 88 };
  const plotW = cssWidth - margin.left - margin.right;
  const plotH = cssHeight - margin.top - margin.bottom;
  const x = (value) => margin.left + ((value - minX) / (maxX - minX)) * plotW;
  const y = (value) => margin.top + plotH - ((value - minY) / (maxY - minY)) * plotH;

  ctx.fillStyle = "#fbfcfd";
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  ctx.strokeStyle = "#d9dee5";
  ctx.strokeRect(margin.left, margin.top, plotW, plotH);
  ctx.font = "12px Segoe UI, Arial, sans-serif";
  ctx.fillStyle = "#66727f";
  for (let i = 0; i <= 4; i += 1) {
    const yy = margin.top + (plotH / 4) * i;
    const value = maxY - ((maxY - minY) / 4) * i;
    ctx.strokeStyle = "#e5e9ee";
    ctx.beginPath();
    ctx.moveTo(margin.left, yy);
    ctx.lineTo(margin.left + plotW, yy);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(formatNumber(value, 3), margin.left - 10, yy);
  }
  for (let i = 0; i <= 5; i += 1) {
    const xx = margin.left + (plotW / 5) * i;
    const value = minX + ((maxX - minX) / 5) * i;
    ctx.strokeStyle = "#eef1f4";
    ctx.beginPath();
    ctx.moveTo(xx, margin.top);
    ctx.lineTo(xx, margin.top + plotH);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(formatNumber(value, 3), xx, margin.top + plotH + 10);
  }
  ctx.fillStyle = "#33404c";
  ctx.font = "13px Segoe UI, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Time (s)", margin.left + plotW / 2, cssHeight - 24);
  ctx.save();
  ctx.translate(22, margin.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  const yLabel = els.showCurrentDensity.checked
    ? (state.plotMode === "raw" ? "Current density (mA/cm^2)" : "Baseline-corrected ionic current density (mA/cm^2)")
    : (state.plotMode === "raw" ? "Current (A)" : "Baseline-corrected ionic current (A)");
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();

  if (els.showIntegrationRegion.checked && state.processedTraces[0]) {
    const first = state.processedTraces[0];
    const xs = x(first.integration.startTime);
    const xe = x(first.integration.endTime);
    ctx.fillStyle = "rgba(14, 124, 134, 0.10)";
    ctx.fillRect(Math.min(xs, xe), margin.top, Math.abs(xe - xs), plotH);
    drawVLine(ctx, xs, margin, plotH, "#0e7c86", "integration start");
    drawVLine(ctx, xe, margin, plotH, "#0e7c86", "integration end");
    drawVLine(ctx, x(first.points[first.edges.pulseStartIndex]?.time ?? first.integration.startTime), margin, plotH, "#a15c07", "pulse edge");
    drawVLine(ctx, x(first.points[first.edges.pulseEndIndex]?.time ?? first.integration.endTime), margin, plotH, "#7b4ea3", "pulse end");
    const y0 = y(0);
    ctx.strokeStyle = "#6b7280";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(margin.left, y0);
    ctx.lineTo(margin.left + plotW, y0);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#33404c";
    ctx.textAlign = "left";
    ctx.fillText("selected integration region", Math.min(xs, xe) + 8, margin.top + 18);
    ctx.fillText("fast electronic response", x(first.points[first.edges.pulseStartIndex]?.time ?? first.integration.startTime) + 8, margin.top + 38);
    ctx.fillText("slow ionic relaxation", margin.left + plotW * 0.62, margin.top + 58);
  }

  nonEmpty.forEach((points, index) => {
    ctx.strokeStyle = plotColors[index % plotColors.length];
    ctx.lineWidth = state.plotMode === "raw" ? 1.2 : 2;
    ctx.beginPath();
    points.forEach((point, pointIndex) => {
      if (pointIndex === 0) ctx.moveTo(x(point.time), y(point.current));
      else ctx.lineTo(x(point.time), y(point.current));
    });
    ctx.stroke();
  });

  const totalPoints = nonEmpty.reduce((sum, points) => sum + points.length, 0);
  els.plotSummary.textContent = `${state.plotMode === "raw" ? "Raw" : "Processed"} DIT, ${nonEmpty.length} trace${nonEmpty.length === 1 ? "" : "s"}, ${totalPoints} points`;
  els.plotLegend.innerHTML = nonEmpty.map((_, index) => {
    const trace = state.processedTraces[index] || state.traces[index];
    const label = trace ? `${trace.fileName} / ${trace.deviceId}` : `Trace ${index + 1}`;
    return `<span class="legend-item"><span class="legend-swatch" style="background:${plotColors[index % plotColors.length]}"></span>${escapeHtml(label)}</span>`;
  }).join("");
}

function drawVLine(ctx, xValue, margin, plotH, color, label) {
  ctx.strokeStyle = color;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(xValue, margin.top);
  ctx.lineTo(xValue, margin.top + plotH);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.save();
  ctx.translate(xValue + 4, margin.top + plotH - 8);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = color;
  ctx.font = "11px Segoe UI, Arial, sans-serif";
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

async function loadFiles(fileList) {
  const files = [...fileList].filter((file) => /\.(txt|csv|tsv)$/i.test(file.name) || file.type.startsWith("text/"));
  if (!files.length) throw new Error("Drop one or more .txt, .csv, or .tsv files.");
  state.validation = null;
  state.files = await Promise.all(files.map(async (file) => ({ name: file.name, text: await file.text() })));
  els.fileName.textContent = state.files.length === 1 ? state.files[0].name : `${state.files.length} files selected`;
  state.parsedFiles = state.files.map((file) => parseData(file.text, file.name));
  updateColumnSelectors();
  applyDetectedFileHints();
  inferCurrentSignFromWindow();
  recalculateSafely();
}

function loadExperimentalSample() {
  const sample = generateExperimentalSample();
  state.validation = null;
  state.files = [{ name: sample.fileName, text: sample.text }];
  els.fileName.textContent = sample.fileName;
  els.timeUnit.value = "us";
  els.currentUnit.value = "mA";
  els.invertCurrent.checked = true;
  els.useAdjacentPairs.checked = true;
  resetProcessing(false);
  state.parsedFiles = state.files.map((file) => parseData(file.text, file.name));
  updateColumnSelectors();
  recalculateSafely();
}

function loadSyntheticSample() {
  const sample = generateSyntheticSample();
  state.validation = { expectedQ: sample.expectedQ };
  state.files = [{ name: sample.fileName, text: sample.text }];
  els.fileName.textContent = sample.fileName;
  els.timeUnit.value = sample.settings.timeUnit;
  els.currentUnit.value = sample.settings.currentUnit;
  els.invertCurrent.checked = sample.settings.invertCurrent;
  els.useAdjacentPairs.checked = false;
  resetProcessing(false);
  els.integrationMode.value = "slow-window";
  els.integrationStart.value = sample.settings.integrationStart;
  els.integrationEnd.value = sample.settings.integrationEnd;
  state.parsedFiles = state.files.map((file) => parseData(file.text, file.name));
  updateColumnSelectors();
  recalculateSafely();
}

function resetProcessing(run = true) {
  els.integrationMode.value = "return-spike";
  els.baselineMode.value = "manual";
  els.manualBaseline.value = "0";
  els.integrationStart.value = "";
  els.integrationEnd.value = "";
  els.excludeSpike.value = "0";
  els.smoothData.checked = false;
  els.smoothWindow.value = "5";
  if (run) recalculateSafely();
}

els.versionTag.textContent = APP_CONFIG.version;
for (let index = 0; index < 8; index += 1) addResistanceInput();
updateColumnSelectors();
updateThermalVoltage();
renderEmpty();

els.fileInput.addEventListener("change", (event) => {
  if (event.target.files?.length) loadFiles(event.target.files).catch((error) => alert(error.message));
});
els.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  els.dropZone.classList.add("dragover");
});
els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("dragover"));
els.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  els.dropZone.classList.remove("dragover");
  if (event.dataTransfer.files?.length) loadFiles(event.dataTransfer.files).catch((error) => alert(error.message));
});

[
  els.thickness, els.thicknessUnit, els.area, els.areaUnit, els.preloadBias, els.builtInPotential,
  els.temperature, els.temperatureUnit, els.manualThermalVoltage, els.thermalVoltage, els.relativePermittivity,
  els.sampleNotes, els.timeColumn, els.currentColumn, els.timeUnit, els.currentUnit, els.invertCurrent, els.showCurrentDensity,
  els.useAdjacentPairs, els.showIntegrationRegion, els.integrationMode, els.baselineMode, els.manualBaseline, els.integrationStart, els.integrationEnd,
  els.excludeSpike, els.smoothData, els.smoothWindow, els.exportWithWarnings,
].forEach((element) => element.addEventListener("input", recalculateSafely));

els.addResistance.addEventListener("click", () => addResistanceInput());
els.resetProcessing.addEventListener("click", () => resetProcessing());
els.loadExperimentalSample.addEventListener("click", loadExperimentalSample);
els.loadSyntheticSample.addEventListener("click", loadSyntheticSample);
els.exportCsv.addEventListener("click", exportCsv);
els.exportJson.addEventListener("click", exportJson);
els.exportPng.addEventListener("click", exportPng);

document.querySelectorAll(".plot-mode").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".plot-mode").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.plotMode = button.dataset.plot;
    drawPlot();
  });
});

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
    button.classList.add("active");
    document.getElementById(`${button.dataset.tab}Panel`).classList.add("active");
  });
});

window.addEventListener("resize", () => drawPlot());
