/** Old amount formatter — used by nobody (IMPL-006). */
export function formatTenge(tiyn) {
  return `${Math.floor(tiyn / 100)} тг ${tiyn % 100} тиын`;
}
