# MeteoScope processed environmental meshes v1

This is a MeteoScope derivative of MLIT National Land Numerical Information. It is not a government temperature estimate or a current land survey. Source data and terms were checked on 2026-11-26.

## Attribution and source terms

- Source: 国土数値情報（土地利用3次メッシュデータ、2016・2021年度、国土交通省）をMeteoScopeが加工して作成。
  - https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-L03-a-v3_1.html
  - Only 2016/2021 releases, designated open data, are used. 2021 is used where supplied; other meshes use 2016.
- Source: 国土数値情報（標高・傾斜度3次メッシュデータ、2011年度、国土交通省）をMeteoScopeが加工して作成。
  - https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-G04-a.html
  - This dataset is designated commercial-use permitted. Elevation mostly derives from GSI 2009 DEM; northern-territory material uses 2008 data.
- General terms: https://nlftp.mlit.go.jp/ksj/other/agreement.html
- Commercial-use data terms: https://nlftp.mlit.go.jp/ksj/other/agreement_02.html

Source attribution, processing attribution and the applicable source conditions must be carried through when reusing this derivative. The source providers do not endorse or guarantee MeteoScope estimates. Observe the linked exclusions, disclaimers and third-party rights; the general PDL terms do not override dataset-specific conditions.

## Meaning and limits

About 1 km cells preserve area fractions of built/transport land, forest, farmland, inland water and sea, plus rounded mean elevation, relief and mean slope. Built/transport area means buildings + roads + rail; it is an artificial-cover proxy, not measured impervious surface or an urban-temperature correction. Land and terrain years differ. Development since the survey, point-scale terrain, cold-air pooling and current weather are not represented. Regional-mesh registration and original source resolutions can introduce coastal/boundary differences. Missing values are not zero. Do not treat these processed attributes as precise current land classification.

`manifest.json` records the original ZIP URLs, SHA-256 hashes, source years and cell counts. `scripts/build-temperature-environment.mjs` reproduces the conversion with at most two simultaneous downloads and local source caching. These are versioned, immutable static assets; change the version path when published bytes change.

## Binary layout

Each primary mesh has 80 × 80 third-order cells, rows south to north, columns west to east. The 16-byte header has ASCII `MSE1`, little-endian uint16 schema, numeric primary mesh, land year and terrain year, then four reserved bytes. Each 10-byte cell has five uint8 fractions (scale 250, missing 255), int16 mean elevation in metres (missing -32768), uint16 elevation range in metres (missing 65535), and uint8 mean slope in half-degrees (missing 255). Shared schema/decoder: `src/location/environmentMesh.js`.
