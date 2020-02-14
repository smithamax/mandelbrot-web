import init, { calc_area } from "./pkg/mandelbrot_web.js";

const initDone = init();

self.onmessage = async msg => {
  await initDone;
  const { data } = msg;
  switch (data.method) {
    case "calc_area":
      const { Y, width, height, xOffset, yOffset, scale, iMax } = data.args;
      const sy = Y / scale + yOffset;

      const result = calc_area(width, height, xOffset, sy, scale, iMax);

      self.postMessage({
        ...data,
        result
      });

      break;
    default:
      throw new Error("unknown method");
  }
};
