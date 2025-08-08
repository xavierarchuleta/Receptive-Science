# Receptive Science — Prototype

This is a static prototype of an interactive 3D chemistry & brain receptor visualization.

## Run locally
- Serve these files with any static server. For example:
  - `npx http-server` in project folder
  - or upload to Netlify/Vercel/GitHub Pages

## Where to add real scientific data
- `molecules.json` is a local mock dataset. To use real molecule metadata:
  - Query PubChem (PUG REST) or ChemSpider and replace `dataService.loadMolecules()` accordingly.
  - **Do not** display instructions for making or dosing real compounds. Only display high-level metadata (e.g., molecular formula, non-actionable receptor associations) and require user consent + disclaimers.
- For real receptor-binding data prefer curated sources (peer-reviewed publications, bindingDB). Always cite sources.

## License & safety
This software is a demonstration and educational prototype. It is not a medical device. The creators are not responsible for misuse.
