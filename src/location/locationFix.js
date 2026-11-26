// GPS metadata stays in memory. Unknown accuracy/time must never become zero.
export function normalizeLocationFix({accuracy,positionTimestamp}={}) {
  return {
    accuracy:typeof accuracy==="number"&&Number.isFinite(accuracy)&&accuracy>=0?accuracy:null,
    positionTimestamp:typeof positionTimestamp==="number"&&Number.isFinite(positionTimestamp)&&positionTimestamp>0?positionTimestamp:null
  };
}
