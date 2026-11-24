export {};
declare global {
  interface Window {
    __salimeterBg?: { stats: () => { creatures: number; degraded: number; frameMs: number } };
  }
}
