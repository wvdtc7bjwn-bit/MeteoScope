import assert from "node:assert/strict";
import { worldLandGeoJson } from "../src/map/data/worldLandGeoJson.js";
import { worldCountriesGeoJson } from "../src/map/data/worldCountriesGeoJson.js";
import { isNonJapaneseLand, removeNorthernTerritoryCountryParts, prepareWorldMapData } from "../src/map/worldLandFilter.js";

assert.equal(worldLandGeoJson, worldCountriesGeoJson, "land and borders share the same geometry");
const japan = worldLandGeoJson.features.find((f) => f.properties.ISO_A3 === "JPN");
const korea = worldLandGeoJson.features.find((f) => f.properties.ISO_A3 === "KOR");
assert.ok(japan && korea, "Japan and South Korea are present in the source data");
assert.equal(isNonJapaneseLand(japan), false, "exclude Japanese land, including Tsushima");
assert.equal(isNonJapaneseLand(korea), true, "retain South Korea and its islands");
const koreaPolygons = korea.geometry.type === "MultiPolygon" ? korea.geometry.coordinates : [korea.geometry.coordinates];
assert.ok(koreaPolygons.some((polygon) => polygon[0].length > 500), "Korean coast retains detailed geometry");
const russia = worldLandGeoJson.features.find((f) => f.properties.ISO_A3 === "RUS");
const filteredRussia = removeNorthernTerritoryCountryParts(russia);
assert.equal(russia.geometry.coordinates.length - filteredRussia.geometry.coordinates.length, 4, "remove the four overlapping Northern Territories polygons");
assert.ok(filteredRussia.geometry.coordinates.length > 100, "retain Russia's remaining land and islands");
assert.equal(prepareWorldMapData(worldLandGeoJson).features.some((f) => f.properties.ISO_A3 === "JPN"), false);
console.log("World land filter tests passed");
