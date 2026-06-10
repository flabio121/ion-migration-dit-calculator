# DIT Ion Migration Calculator

A browser-based calculator for estimating mobile ion characteristics from DIT text files.

The calculator runs entirely in the browser. Uploaded files are parsed locally by the page; no data is sent to a server.

## Features

- Drag and drop one or more `.txt` DIT files
- Calculate mobile ion concentration
- Optionally calculate conductivity and mobility from ionic resistance inputs
- Plot raw and processed DIT traces
- Preview raw and processed data tables
- Export the result table to CSV

## Use

Open `index.html` in a browser, or use the GitHub Pages link once deployed.

Quick-start PDF: [`docs/DIT_Calculator_Quick_Start.pdf`](docs/DIT_Calculator_Quick_Start.pdf)

1. Drop one or more DIT `.txt` files onto the upload area.
2. Confirm the device constants.
3. Add ionic resistance values if conductivity and mobility are needed.
4. Review the DIT plot and result table.
5. Export results as CSV when needed.

## Notes

This web calculator was translated from the Excel-based ion migration calculator workflow and preserves the current browser-side DIT calculation behavior.
