export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const sleepExpo = (ms: number, base: number, exponent: number) =>
  sleep(ms * Math.pow(base, exponent));
