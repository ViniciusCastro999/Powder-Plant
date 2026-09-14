/** The 8 cells touching a given one (orthogonal + diagonal). */
export const NEIGHBORS_8 = [
  [0, -1], [0, 1], [-1, 0], [1, 0],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
] as const;
/** The 4 cells orthogonally touching a given one. */
export const NEIGHBORS_4 = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const;
