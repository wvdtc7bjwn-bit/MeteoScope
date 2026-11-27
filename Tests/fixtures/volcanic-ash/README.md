Official JMA XML samples, copied without modification from:
https://xml.kishou.go.jp/jmaxml_20261118_Samples.zip

- `66_01_*`: legacy VFVO53/54/55 (three ash-amount categories).
- `66_02_*`: new VFVO53/54/55 (seven cumulative depth thresholds).
- `93_01_*`: VFVO70 initial, updated and all-clear nationwide snapshots.

These are test fixtures, not live alerts. Their `Status` is `通常` by design;
the product rollout must not be activated by their timestamps or receipt.
Do not import them from application entrypoints or publish them as current data.

Code definitions were checked against `VolcanicAshWarning` in the official
2026-11-18 code-table archive:
https://xml.kishou.go.jp/jmaxml_20261118_Code.zip

Design notices: JMA technical information 684 and 685 (2026-11-09).
Source: Japan Meteorological Agency. Tests parse and modify in-memory copies.
Reuse terms: https://www.jma.go.jp/jma/kishou/info/coment.html
