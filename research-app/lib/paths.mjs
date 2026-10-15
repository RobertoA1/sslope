export const LAB_BASE_PATH = '/research';

export function researchApiPath(path) {
  return `${LAB_BASE_PATH}/api${path.startsWith('/') ? path : `/${path}`}`;
}
