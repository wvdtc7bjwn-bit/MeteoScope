export function assignAmedasCompetitionRanks(items = []) {
  let previousValue;
  let currentRank = 0;

  return items.map((item, index) => {
    const value = Number(item?.value);
    if (index === 0 || value !== previousValue) {
      currentRank = index + 1;
    }
    previousValue = value;
    return { ...item, rank: currentRank };
  });
}
