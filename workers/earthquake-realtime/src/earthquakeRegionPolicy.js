export function collectDmdataIntensityRegions(intensity = {}, body = {}) {
  const regions = [];
  const append = value => {
    if (Array.isArray(value)) regions.push(...value);
  };
  const appendPrefectureRegions = value => {
    if (!Array.isArray(value)) return;
    value.forEach(prefecture => append(prefecture?.regions));
  };

  append(intensity?.regions);
  append(body?.regions);
  appendPrefectureRegions(intensity?.prefectures);
  appendPrefectureRegions(body?.prefectures);
  appendPrefectureRegions(intensity?.observation?.prefectures);
  appendPrefectureRegions(body?.observation?.prefectures);

  return regions;
}
