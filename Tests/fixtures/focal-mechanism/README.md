Fixtures are excerpts of JMA official records, retrieved 2026-11-12.

- https://www.data.jma.go.jp/eqev/data/mech/cmt/cmt202611.html
- https://www.data.jma.go.jp/eqev/data/mech/ini/mc202611.html
- https://www.data.jma.go.jp/eqev/data/bulletin/data/cmt/cmt202401.zip (first hypocentre, centroid, mechanism records)
- Format: https://www.data.jma.go.jp/eqev/data/bulletin/data/format/fmtcmt_j.html

The fixed-width fixture ends with an abbreviated termination record. It is not a live bulletin.

USGS fixtures (retrieved 2026-11-12; only event metadata and moment-tensor products retained):
- https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=us6000m0xl&format=geojson
- https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=us7000twt0&format=geojson
USGS-authored public data; these records are test fixtures, not live alerts.
Projection comparison reference (USGS):
https://github.com/usgs/earthquake-eventpages/blob/master/src/app/shared/beachball/beachball.ts
https://github.com/usgs/earthquake-eventpages/blob/master/src/app/shared/beachball/tensor.ts
The app evaluates the tensor radiation directly; it does not copy the reference renderer.
