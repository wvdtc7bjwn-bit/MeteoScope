// Pivoted elimination for small, standardized regression systems.
export function solveLinearSystem(matrix, vector) {
  const rows = matrix.map((row, i) => [...row, vector[i]]), size = vector.length;
  let largest = 0, smallest = Infinity;
  for (let col = 0; col < size; col++) {
    let pivot = col;
    for (let row = col + 1; row < size; row++) if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const value = rows[col][col]; largest = Math.max(largest, Math.abs(value)); smallest = Math.min(smallest, Math.abs(value));
    if (!Number.isFinite(value) || Math.abs(value) < 1e-8 || largest / smallest > 1e5) return null;
    for (let j = col; j <= size; j++) rows[col][j] /= value;
    for (let row = 0; row < size; row++) if (row !== col) {
      const scale = rows[row][col]; for (let j = col; j <= size; j++) rows[row][j] -= scale * rows[col][j];
    }
  }
  return rows.map(row => row[size]);
}
