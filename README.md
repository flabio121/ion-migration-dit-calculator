# DIT Ion Migration Calculator

A browser-based calculator for estimating mobile ion characteristics from DIT text files.

The calculator runs entirely in the browser. Uploaded files are parsed locally by the page; no data is sent to a server.

## Features

- Drag and drop one or more `.txt`, `.csv`, or `.tsv` DIT files
- Inspect detected delimiter, rows, columns, units, and selected time/current columns
- Calculate integrated ionic charge, areal charge density, mobile ion concentration, conductivity, and mobility
- Adjust baseline mode, integration bounds, spike exclusion, and smoothing
- Plot raw and processed DIT traces with the integrated region marked
- Review data-quality warnings and assumption sensitivity
- Preview raw and processed data tables
- Export CSV summaries, JSON reproducibility reports, and PNG plots
- Run an in-browser synthetic validation sample with known integrated charge
- Supports COMSOL-style time/current exports with fast electronic spikes by starting integration after the first spike and ending before a return spike when detected

## Use

Open `index.html` in a browser, or use the GitHub Pages link once deployed.

Quick-start PDF: [`docs/DIT_Calculator_Quick_Start.pdf`](docs/DIT_Calculator_Quick_Start.pdf)

1. Drop one or more DIT `.txt` files onto the upload area.
2. Confirm the device constants.
3. Add ionic resistance values if conductivity and mobility are needed.
4. Review the DIT plot and result table.
5. Export results as CSV when needed.

## Local validation

```bash
npm test
```

## Notes

This web calculator was translated from the Excel-based ion migration calculator workflow and preserves the current browser-side DIT calculation behavior.
