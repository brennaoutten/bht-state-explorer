# BHT State Explorer

This repository contains the public BHT Mandates by State explorer.

## Files

- `index.html` — page structure
- `styles.css` — approved visual design
- `app.js` — live Google Sheets loader plus filters, state detail view, and multi-state comparison
- `.nojekyll` — tells GitHub Pages to serve these static files directly

## Live data source

Published Google Sheet tab:

https://docs.google.com/spreadsheets/d/e/2PACX-1vSjNReTl3eyYjiLbARfIUdaDmh5KbogSZD0xoCKHQRqn4REbLAS5EE7XPWuhsfwUA/pubhtml?gid=1208255361&single=true

The site reads the published sheet at page load. Editing the Google Sheet does **not** require changing this repository. After Google republishes the sheet, a browser refresh loads the current values.

## GitHub Pages setup

1. Create a new GitHub repository, for example `bht-state-explorer`.
2. Upload all four files in this folder to the repository root.
3. Commit the files to `main`.
4. Open **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select **main** and **/(root)**, then save.
7. GitHub will show the public Pages URL when deployment is complete.

For a project repository, the URL normally follows this pattern:

`https://YOUR-USERNAME.github.io/bht-state-explorer/`

## Updating the data

Edit the public-data tab in Google Sheets. No GitHub edit is needed for ordinary data changes.

If the website design, filters, labels, or behavior need to change, update the files in this repository.

## Important publishing rule

Only put information intended for public display in the published Google Sheet tab. Do not publish internal notes or sensitive material.
