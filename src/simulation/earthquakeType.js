// Si & Midorikawa (1999), J-SHIS 2.4.1. Coefficients apply to the
// reference PGV relation, not to an assertion about a real earthquake.
export const EARTHQUAKE_TYPE_COEFFICIENTS=Object.freeze({crustal:0,interplate:-.02,intraslab:.12});
export function simulationEarthquakeType(options){
  const preset=["nankai-trough","japan-trench","kuril-trench"].includes(options.model);
  const type=preset?"interplate":options.model==="active-fault"?"crustal":options.earthquakeType??"crustal";
  if(!Object.hasOwn(EARTHQUAKE_TYPE_COEFFICIENTS,type))throw new RangeError("Invalid earthquake type");
  return type;
}
