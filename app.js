const EARLY_START = 1590;
const EARLY_END = 1600;
const LATE_START = 2632;
const ELEMENTARY_CHARGE_C = 1.602176634e-19;
const VACUUM_PERMITTIVITY_FM = 8.854187817e-12;
const SAMPLE_PATH = "../Excel/0.txt";

const state = {
  files: [],
  results: [],
  raw: [],
  processed: [],
  deviceIds: [],
  biasBracket: NaN,
  plotMode: "processed",
};

const els = {
  fileInput: document.getElementById("fileInput"),
  dropZone: document.getElementById("dropZone"),
  fileName: document.getElementById("fileName"),
  thickness: document.getElementById("thickness"),
  area: document.getElementById("area"),
  preloadBias: document.getElementById("preloadBias"),
  builtInPotential: document.getElementById("builtInPotential"),
  thermalVoltage: document.getElementById("thermalVoltage"),
  relativePermittivity: document.getElementById("relativePermittivity"),
  resistanceList: document.getElementById("resistanceList"),
  addResistance: document.getElementById("addResistance"),
  loadSample: document.getElementById("loadSample"),
  exportResults: document.getElementById("exportResults"),
  measurementCount: document.getElementById("measurementCount"),
  pointCount: document.getElementById("pointCount"),
  biasBracket: document.getElementById("biasBracket"),
  resultsBody: document.querySelector("#resultsTable tbody"),
  processedTable: document.getElementById("processedTable"),
  rawTable: document.getElementById("rawTable"),
  ditChart: document.getElementById("ditChart"),
  plotSummary: document.getElementById("plotSummary"),
  plotLegend: document.getElementById("plotLegend"),
};

const plotColors = [
  "#0e7c86",
  "#a23b72",
  "#2f6f3e",
  "#c05a28",
  "#4d5f9f",
  "#8a6b12",
  "#287cba",
  "#7b4ea3",
  "#3d776d",
  "#b3434a",
  "#5b6b2a",
  "#73523a",
];

function numericValue(input) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : NaN;
}

function formatNumber(value, digits = 6) {
  if (value === null || value === undefined || value === "" || Number.isNaN(value)) return "--";
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 10000 || abs < 0.001) return value.toExponential(digits);
  return value.toPrecision(digits + 1).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function parseNumericRow(line) {
  const parts = line.trim().split(/\t/);
  if (parts.length < 2 || parts.length % 2 !== 0) return null;
  const values = parts.map((part) => Number(part.trim()));
  if (values.some((value) => !Number.isFinite(value))) return null;
  return values;
}

function findDataLines(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const dataIndex = lines.findIndex((line) => line.includes("### Data:"));
  const start = dataIndex >= 0 ? dataIndex + 1 : 0;
  return lines.slice(start).map((line) => line.trim()).filter(Boolean);
}

function extractDeviceIds(text, measurementCount) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const ids = [];
  const commentIndex = lines.findIndex((line) => line.includes("### Comment:"));
  if (commentIndex >= 0 && lines[commentIndex + 1]) {
    const comment = lines[commentIndex + 1].trim();
    if (comment.length > 21 && comment.includes(":")) {
      ids.push(comment.split(":")[0].replace(/^"|"$/g, "").trim());
    }
  }
  for (const line of lines) {
    if (/Column/i.test(line) && line.includes(":")) {
      const label = line.split(":").slice(1).join(":").trim();
      if (label) ids.push(label.replace(/^"|"$/g, ""));
    }
  }
  return Array.from({ length: measurementCount }, (_, index) => ids[index] || `Device ${index + 1}`);
}

function processText(text) {
  const dataLines = findDataLines(text);
  let firstRow = null;
  let firstLineIndex = -1;
  for (let index = 0; index < dataLines.length; index += 1) {
    firstRow = parseNumericRow(dataLines[index]);
    if (firstRow) {
      firstLineIndex = index;
      break;
    }
  }
  if (!firstRow) throw new Error("No tab-delimited numeric data rows were found.");

  const measurementCount = firstRow.length / 2;
  const raw = Array.from({ length: measurementCount }, () => []);
  const processed = Array.from({ length: measurementCount }, () => []);
  const started = Array(measurementCount).fill(false);
  const tCum = Array(measurementCount).fill(0);
  const havePrev1 = Array(measurementCount).fill(false);
  const havePrev2 = Array(measurementCount).fill(false);
  const prevTimeUs = Array(measurementCount).fill(0);
  const prev1mA = Array(measurementCount).fill(0);
  const prev2mA = Array(measurementCount).fill(0);

  let workbookRowIndex = 1;
  for (let lineIndex = firstLineIndex; lineIndex < dataLines.length; lineIndex += 1) {
    const values = parseNumericRow(dataLines[lineIndex]);
    if (!values || values.length !== measurementCount * 2) {
      workbookRowIndex += 1;
      continue;
    }

    for (let m = 0; m < measurementCount; m += 1) {
      const rawTimeUs = values[2 * m];
      const rawCurrMA = values[2 * m + 1];
      raw[m].push({ time: rawTimeUs * 1e-6, current: rawCurrMA * 1e-3 });

      if (!started[m]) {
        const earlyStart =
          workbookRowIndex > EARLY_START &&
          workbookRowIndex < EARLY_END &&
          rawCurrMA < 0 &&
          havePrev1[m] &&
          prev1mA[m] < 0 &&
          havePrev2[m] &&
          prev2mA[m] < 0;

        const lateStart =
          !earlyStart &&
          workbookRowIndex > LATE_START &&
          rawCurrMA < 0 &&
          havePrev1[m];

        if (earlyStart || lateStart) {
          started[m] = true;
          tCum[m] = 0;
          processed[m].push({ time: 0, current: -prev1mA[m] * 1e-3 });
          const dt = Math.max(0, (rawTimeUs - prevTimeUs[m]) * 1e-6);
          tCum[m] += dt;
          processed[m].push({ time: tCum[m], current: -rawCurrMA * 1e-3 });
        }
      } else {
        const dt = Math.max(0, (rawTimeUs - prevTimeUs[m]) * 1e-6);
        tCum[m] += dt;
        processed[m].push({ time: tCum[m], current: -rawCurrMA * 1e-3 });
      }

      prev2mA[m] = prev1mA[m];
      havePrev2[m] = havePrev1[m];
      prev1mA[m] = rawCurrMA;
      havePrev1[m] = true;
      prevTimeUs[m] = rawTimeUs;
    }
    workbookRowIndex += 1;
  }

  return {
    raw,
    processed,
    deviceIds: extractDeviceIds(text, measurementCount),
  };
}

function integrateTrap(points) {
  let area = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    area += 0.5 * (a.current + b.current) * (b.time - a.time);
  }
  return area;
}

function calculate() {
  if (!state.files.length) {
    renderEmpty();
    return;
  }

  const thickness = numericValue(els.thickness);
  const area = numericValue(els.area);
  const preloadBias = numericValue(els.preloadBias);
  const builtInPotential = numericValue(els.builtInPotential);
  const thermalVoltage = numericValue(els.thermalVoltage);
  const relativePermittivity = numericValue(els.relativePermittivity);
  const resistances = [...els.resistanceList.querySelectorAll("input")].map((input) => Number(input.value));

  if (![thickness, area, preloadBias, builtInPotential, thermalVoltage, relativePermittivity].every(Number.isFinite)) {
    showError("Please enter valid numeric constants.");
    return;
  }

  const biasBracket =
    Math.sqrt(1 + 16 * (builtInPotential / thermalVoltage)) -
    Math.sqrt(1 + 16 * ((builtInPotential - preloadBias) / thermalVoltage));

  state.biasBracket = biasBracket;
  state.raw = [];
  state.processed = [];
  state.deviceIds = [];
  state.results = [];

  for (const source of state.files) {
    const parsed = processText(source.text);
    parsed.raw.forEach((points) => state.raw.push(points));
    parsed.processed.forEach((points) => state.processed.push(points));
    parsed.deviceIds.forEach((deviceId) => state.deviceIds.push(deviceId));

    parsed.processed.forEach((points, measurementIndex) => {
      const resultIndex = state.results.length;
      const chargeC = integrateTrap(points);
      let concentration = null;
      if (chargeC !== 0 && Number.isFinite(chargeC)) {
        const arealCharge = chargeC / area;
        const bracketAdjusted = arealCharge / biasBracket;
        const n0m3 =
          (8 * bracketAdjusted ** 2) /
          (ELEMENTARY_CHARGE_C * VACUUM_PERMITTIVITY_FM * relativePermittivity * thermalVoltage);
        concentration = n0m3 / 1e6;
      }

      const resistance = resistances[resultIndex];
      let conductivity = null;
      let mobility = null;
      if (Number.isFinite(resistance) && resistance > 0 && concentration && concentration > 0) {
        conductivity = thickness / (resistance * area);
        mobility = conductivity / (ELEMENTARY_CHARGE_C * concentration) * 0.01;
      }

      state.results.push({
        deviceId: parsed.deviceIds[measurementIndex],
        sourceFile: source.name,
        conductivity,
        concentration,
        mobility,
        points: points.length,
        chargeC,
      });
    });
  }

  renderAll();
}

function renderEmpty() {
  els.resultsBody.innerHTML = '<tr class="empty-row"><td colspan="7">Upload one or more DIT files to calculate results.</td></tr>';
  els.processedTable.innerHTML = "";
  els.rawTable.innerHTML = "";
  els.measurementCount.textContent = "0";
  els.pointCount.textContent = "0";
  els.biasBracket.textContent = "--";
  els.exportResults.disabled = true;
  drawPlot();
}

function showError(message) {
  els.resultsBody.innerHTML = `<tr class="empty-row"><td colspan="7" class="warning">${message}</td></tr>`;
  els.exportResults.disabled = true;
}

function renderAll() {
  els.measurementCount.textContent = String(state.results.length);
  els.pointCount.textContent = String(state.processed.reduce((sum, points) => sum + points.length, 0));
  els.biasBracket.textContent = formatNumber(state.biasBracket, 5);
  els.exportResults.disabled = state.results.length === 0;
  renderResults();
  drawPlot();
  renderMatrixTable(els.processedTable, state.processed, 250);
  renderMatrixTable(els.rawTable, state.raw, 250);
}

function renderResults() {
  els.resultsBody.innerHTML = state.results.map((row) => `
    <tr>
      <td>${escapeHtml(row.deviceId)}</td>
      <td>${escapeHtml(row.sourceFile || "")}</td>
      <td>${formatNumber(row.conductivity)}</td>
      <td>${row.concentration === null ? "No Response!" : formatNumber(row.concentration)}</td>
      <td>${formatNumber(row.mobility)}</td>
      <td>${row.points}</td>
      <td>${formatNumber(row.chargeC)}</td>
    </tr>
  `).join("");
}

function renderMatrixTable(table, series, maxRows) {
  if (!series.length) {
    table.innerHTML = "";
    return;
  }
  const headers = series.flatMap((_, index) => {
    const result = state.results[index];
    const label = result ? `${result.sourceFile} / ${result.deviceId}` : `Device ${index + 1}`;
    return [`${label} time (s)`, `${label} current (A)`];
  });
  const rowCount = Math.min(maxRows, Math.max(...series.map((points) => points.length)));
  const head = `<thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>`;
  let body = "<tbody>";
  for (let row = 0; row < rowCount; row += 1) {
    body += "<tr>";
    for (const points of series) {
      const point = points[row];
      body += `<td>${point ? formatNumber(point.time) : ""}</td><td>${point ? formatNumber(point.current) : ""}</td>`;
    }
    body += "</tr>";
  }
  if (Math.max(...series.map((points) => points.length)) > maxRows) {
    body += `<tr class="empty-row"><td colspan="${headers.length}">Preview limited to ${maxRows} rows. Export results for the summary table.</td></tr>`;
  }
  body += "</tbody>";
  table.innerHTML = head + body;
}

function getPlotSeries() {
  return state.plotMode === "raw" ? state.raw : state.processed;
}

function drawPlot() {
  const canvas = els.ditChart;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = Math.max(320, rect.width || canvas.clientWidth || 900);
  const cssHeight = Math.max(260, rect.height || canvas.clientHeight || 420);

  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const series = getPlotSeries();
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

  const allPoints = nonEmpty.flat();
  let minX = Math.min(...allPoints.map((point) => point.time));
  let maxX = Math.max(...allPoints.map((point) => point.time));
  let minY = Math.min(...allPoints.map((point) => point.current));
  let maxY = Math.max(...allPoints.map((point) => point.current));
  if (minX === maxX) {
    minX -= 1;
    maxX += 1;
  }
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }

  const xPad = (maxX - minX) * 0.04;
  const yPad = (maxY - minY) * 0.12;
  minX -= xPad;
  maxX += xPad;
  minY -= yPad;
  maxY += yPad;

  const margin = { top: 22, right: 22, bottom: 58, left: 82 };
  const plotW = cssWidth - margin.left - margin.right;
  const plotH = cssHeight - margin.top - margin.bottom;
  const xScale = (value) => margin.left + ((value - minX) / (maxX - minX)) * plotW;
  const yScale = (value) => margin.top + plotH - ((value - minY) / (maxY - minY)) * plotH;

  ctx.fillStyle = "#fbfcfd";
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  ctx.strokeStyle = "#d9dee5";
  ctx.lineWidth = 1;
  ctx.strokeRect(margin.left, margin.top, plotW, plotH);

  ctx.font = "12px Segoe UI, Arial, sans-serif";
  ctx.fillStyle = "#66727f";
  ctx.strokeStyle = "#e5e9ee";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i += 1) {
    const y = margin.top + (plotH / 4) * i;
    const value = maxY - ((maxY - minY) / 4) * i;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + plotW, y);
    ctx.stroke();
    ctx.fillText(formatNumber(value, 3), margin.left - 10, y);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i <= 5; i += 1) {
    const x = margin.left + (plotW / 5) * i;
    const value = minX + ((maxX - minX) / 5) * i;
    ctx.beginPath();
    ctx.moveTo(x, margin.top);
    ctx.lineTo(x, margin.top + plotH);
    ctx.stroke();
    ctx.fillText(formatNumber(value, 3), x, margin.top + plotH + 10);
  }

  ctx.fillStyle = "#33404c";
  ctx.font = "13px Segoe UI, Arial, sans-serif";
  ctx.fillText("Time (s)", margin.left + plotW / 2, cssHeight - 24);
  ctx.save();
  ctx.translate(22, margin.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Current (A)", 0, 0);
  ctx.restore();

  nonEmpty.forEach((points, index) => {
    ctx.beginPath();
    points.forEach((point, pointIndex) => {
      const x = xScale(point.time);
      const y = yScale(point.current);
      if (pointIndex === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = plotColors[index % plotColors.length];
    ctx.lineWidth = state.plotMode === "raw" ? 1.2 : 2;
    ctx.stroke();
  });

  const totalPoints = nonEmpty.reduce((sum, points) => sum + points.length, 0);
  els.plotSummary.textContent = `${state.plotMode === "raw" ? "Raw" : "Processed"} DIT, ${nonEmpty.length} trace${nonEmpty.length === 1 ? "" : "s"}, ${totalPoints} points`;
  els.plotLegend.innerHTML = nonEmpty.map((_, index) => {
    const result = state.results[index];
    const label = result ? `${result.sourceFile} / ${result.deviceId}` : `Trace ${index + 1}`;
    return `<span class="legend-item"><span class="legend-swatch" style="background:${plotColors[index % plotColors.length]}"></span>${escapeHtml(label)}</span>`;
  }).join("");
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

function addResistanceInput(value = "") {
  const index = els.resistanceList.children.length + 1;
  const label = document.createElement("label");
  label.innerHTML = `
    Device ${index}
    <span class="input-with-unit">
      <input type="number" step="any" value="${value}">
      <span>Ω</span>
    </span>
  `;
  label.querySelector("input").addEventListener("input", recalculateSafely);
  els.resistanceList.appendChild(label);
}

function ensureResistanceInputs(count) {
  while (els.resistanceList.children.length < count) addResistanceInput();
}

function recalculateSafely() {
  try {
    calculate();
  } catch (error) {
    showError(error.message);
  }
}

async function loadFiles(files) {
  const textFiles = [...files].filter((file) => /\.txt$/i.test(file.name) || /\.(tsv|csv)$/i.test(file.name) || file.type.startsWith("text/"));
  if (!textFiles.length) throw new Error("Drop one or more .txt files.");
  state.files = await Promise.all(textFiles.map(async (file) => ({ name: file.name, text: await file.text() })));
  const measurementCount = state.files.reduce((sum, source) => sum + processText(source.text).processed.length, 0);
  ensureResistanceInputs(measurementCount);
  els.fileName.textContent = state.files.length === 1 ? state.files[0].name : `${state.files.length} files selected`;
  recalculateSafely();
}

async function loadSample() {
  const response = await fetch(SAMPLE_PATH);
  if (!response.ok) throw new Error("Sample file could not be loaded from ../Excel/0.txt.");
  state.files = [{ name: "0.txt", text: await response.text() }];
  ensureResistanceInputs(1);
  els.fileName.textContent = "0.txt";
  recalculateSafely();
}

function exportResultsCsv() {
  const rows = [
    ["Device ID", "Source file", "Conductivity (S/m)", "Concentration (cm^-3)", "Mobility (cm^2/V/s)", "Data Points", "Charge (C)"],
    ...state.results.map((row) => [
      row.deviceId,
      row.sourceFile ?? "",
      row.conductivity ?? "",
      row.concentration ?? "No Response!",
      row.mobility ?? "",
      row.points,
      row.chargeC,
    ]),
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ion-migration-results.csv";
  link.click();
  URL.revokeObjectURL(url);
}

els.fileInput.addEventListener("change", (event) => {
  const files = event.target.files;
  if (files?.length) loadFiles(files).catch((error) => showError(error.message));
});

for (const input of [els.thickness, els.area, els.preloadBias, els.builtInPotential, els.thermalVoltage, els.relativePermittivity]) {
  input.addEventListener("input", recalculateSafely);
}

els.addResistance.addEventListener("click", () => addResistanceInput());
els.loadSample.addEventListener("click", () => loadSample().catch((error) => showError(error.message)));
els.exportResults.addEventListener("click", exportResultsCsv);

els.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  els.dropZone.classList.add("dragover");
});

els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("dragover"));
els.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  els.dropZone.classList.remove("dragover");
  const files = event.dataTransfer.files;
  if (files?.length) loadFiles(files).catch((error) => showError(error.message));
});

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
    button.classList.add("active");
    document.getElementById(`${button.dataset.tab}Panel`).classList.add("active");
  });
});

document.querySelectorAll(".plot-mode").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".plot-mode").forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    state.plotMode = button.dataset.plot;
    drawPlot();
  });
});

window.addEventListener("resize", () => drawPlot());

for (let index = 0; index < 8; index += 1) addResistanceInput();
renderEmpty();
