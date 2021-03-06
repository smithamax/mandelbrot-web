import init, { calc_area } from "./pkg/mandelbrot_web.js";

const iMax = 1000;

let canvas;
let width;
let height;
let minD;

let scale = 0;
let xOffset = 0;
let yOffset = 0;
// navigator.hardwareConcurrency
let workers;

async function setup() {
  console.log("setup");
  canvas = document.createElement("canvas");
  width = canvas.width = document.body.clientWidth * 2;
  height = canvas.height = document.body.clientHeight * 2;
  minD = Math.min(width, height);

  const url = new URL(location);

  if (url.searchParams.has("scale")) {
    scale = parseFloat(url.searchParams.get("scale"));
  } else {
    scale = minD / 3;
  }
  if (url.searchParams.has("x")) {
    xOffset = parseFloat(url.searchParams.get("x"));
  } else {
    xOffset = -(width / 2 / scale) - 0.75;
  }
  if (url.searchParams.has("y")) {
    yOffset = parseFloat(url.searchParams.get("y"));
  } else {
    yOffset = -(height / 2 / scale);
  }

  history.replaceState({ xOffset, yOffset, scale }, "");

  canvas.style.width = document.body.clientWidth + "px";
  canvas.style.height = document.body.clientHeight + "px";

  document.body.style.margin = 0;
  document.body.appendChild(canvas);

  await init();

  startRender();
}

let Y = 0;
const rows = 100;

let renderID = 0;
let rendersOutstanding = 0;

function startRender() {
  console.time("render");
  Y = 0;
  // return requestAnimationFrame(render);
  renderID++;

  if (rendersOutstanding) {
    workers.forEach(w => w.terminate());
    workers = null;
  }
  if (!workers) {
    workers = [1, 2, 3, 4].map(i => {
      const w = new Worker("./worker.js", { type: "module" });
      w.addEventListener("message", handleRender);
      return w;
    });
  }

  rendersOutstanding = 0;

  while (Y < height) {
    rendersOutstanding++;
    workers[rendersOutstanding % workers.length].postMessage({
      method: "calc_area",
      renderID,
      args: {
        Y,
        width,
        height: rows,
        xOffset,
        yOffset,
        scale,
        iMax
      }
    });
    Y += rows;
  }
}

function render() {
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(width, rows);

  if (Y >= height) {
    console.timeEnd("render");
    history.replaceState(
      {
        xOffset,
        yOffset,
        scale,
        imageData: ctx.getImageData(0, 0, width, height)
      },
      ""
    );
    return;
  }

  const sy = Y / scale + yOffset;

  const result = calc_area(width, rows, xOffset, sy, scale, iMax);

  for (let i = 0; i < result.length; i++) {
    const val = result[i];
    const p4 = i * 4;
    // const g = Math.log(val) * 40;
    let color = [0, 0, 0];
    if (val < iMax) {
      color = getColor(val);
    }
    imageData.data[p4 + 0] = color[0]; // R value
    imageData.data[p4 + 1] = color[1]; // G value
    imageData.data[p4 + 2] = color[2]; // B value
    imageData.data[p4 + 3] = 255; // A value
  }

  ctx.putImageData(imageData, 0, Y);

  Y += rows;
  requestAnimationFrame(render);
}

function handleRender(msg) {
  const { args, result } = msg.data;

  if (msg.data.renderID !== renderID) {
    console.log("out of date", args);
    return;
  }

  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(args.width, args.height);

  for (let i = 0; i < result.length; i++) {
    const val = result[i];
    const p4 = i * 4;
    let color = [0, 0, 0];
    if (val < args.iMax) {
      color = getColor(val);
    }
    imageData.data[p4 + 0] = color[0]; // R value
    imageData.data[p4 + 1] = color[1]; // G value
    imageData.data[p4 + 2] = color[2]; // B value
    imageData.data[p4 + 3] = 255; // A value
  }

  requestAnimationFrame(() => {
    if (msg.data.renderID !== renderID) {
      return;
    }

    rendersOutstanding--;
    ctx.putImageData(imageData, 0, args.Y);

    if (!rendersOutstanding) {
      console.timeEnd("render");

      history.replaceState(
        {
          xOffset,
          yOffset,
          scale,
          imageData: ctx.getImageData(0, 0, width, height)
        },
        ""
      );
    }
  });
}

window.addEventListener("DOMContentLoaded", setup);

let selecting = false;
const selector = document.createElement("div");

selector.style.border = "1px solid red";
selector.style.position = "absolute";

function calculateSelector(event) {
  const boxWidth =
    Math.max(event.clientX, selecting[0]) -
    Math.min(event.clientX, selecting[0]);
  const boxHeight =
    Math.max(event.clientY, selecting[1]) -
    Math.min(event.clientY, selecting[1]);

  const screenRatio = width / height;
  const [selectWidth, selectHeight] =
    screenRatio < boxWidth / boxHeight
      ? [boxWidth, boxWidth / screenRatio]
      : [boxHeight * screenRatio, boxHeight];

  return {
    width: selectWidth,
    height: selectHeight,
    left:
      event.clientX > selecting[0] ? selecting[0] : selecting[0] - selectWidth,
    top:
      event.clientY > selecting[1] ? selecting[1] : selecting[1] - selectHeight
  };
}

window.addEventListener("mousedown", event => {
  selecting = [event.clientX, event.clientY];
  selector.style.left = event.clientX;
  selector.style.top = event.clientY;
  selector.style.width = 0;
  selector.style.height = 0;
  document.body.appendChild(selector);
});

window.addEventListener("mouseup", event => {
  const selectorRect = calculateSelector(event);
  xOffset += (selectorRect.left * 2) / scale;
  yOffset += (selectorRect.top * 2) / scale;

  const scaleDelta = document.body.clientWidth / selectorRect.width;
  scale = scale * scaleDelta;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(
    canvas,
    selectorRect.left * 2,
    selectorRect.top * 2,
    selectorRect.width * 2,
    selectorRect.height * 2,
    0,
    0,
    width,
    height
  );

  const state = {
    xOffset,
    yOffset,
    scale
  };
  history.pushState(
    state,
    "",
    "?" +
      new URLSearchParams({
        x: xOffset,
        y: yOffset,
        scale
      })
  );

  selecting = false;
  selector.remove();
  startRender();
});

window.addEventListener("mousemove", event => {
  if (!selecting) {
    return;
  }

  const selectorRect = calculateSelector(event);

  selector.style.width = selectorRect.width + "px";
  selector.style.height = selectorRect.height + "px";
  selector.style.left = selectorRect.left;
  selector.style.top = selectorRect.top;
});

window.addEventListener("popstate", event => {
  scale = event.state.scale;
  xOffset = event.state.xOffset;
  yOffset = event.state.yOffset;

  if (event.state.imageData) {
    const ctx = canvas.getContext("2d");
    renderID++;
    ctx.putImageData(event.state.imageData, 0, 0);
    return;
  }
  startRender();
});

const colorMem = new Array(iMax);

function getColor(val) {
  if (!colorMem[val]) {
    // const c = (Math.log10(val) * 256) % 256 | 0;
    const c = 255 - Math.abs(((Math.log10(val) * 256) % 512 | 0) - 255);
    colorMem[val] = colors[c];
  }
  return colorMem[val];
}

const colors = [
  [0x44, 0x01, 0x54],
  [0x44, 0x02, 0x56],
  [0x45, 0x04, 0x57],
  [0x45, 0x05, 0x59],
  [0x46, 0x07, 0x5a],
  [0x46, 0x08, 0x5c],
  [0x46, 0x0a, 0x5d],
  [0x46, 0x0b, 0x5e],
  [0x47, 0x0d, 0x60],
  [0x47, 0x0e, 0x61],
  [0x47, 0x10, 0x63],
  [0x47, 0x11, 0x64],
  [0x47, 0x13, 0x65],
  [0x48, 0x14, 0x67],
  [0x48, 0x16, 0x68],
  [0x48, 0x17, 0x69],
  [0x48, 0x18, 0x6a],
  [0x48, 0x1a, 0x6c],
  [0x48, 0x1b, 0x6d],
  [0x48, 0x1c, 0x6e],
  [0x48, 0x1d, 0x6f],
  [0x48, 0x1f, 0x70],
  [0x48, 0x20, 0x71],
  [0x48, 0x21, 0x73],
  [0x48, 0x23, 0x74],
  [0x48, 0x24, 0x75],
  [0x48, 0x25, 0x76],
  [0x48, 0x26, 0x77],
  [0x48, 0x28, 0x78],
  [0x48, 0x29, 0x79],
  [0x47, 0x2a, 0x7a],
  [0x47, 0x2c, 0x7a],
  [0x47, 0x2d, 0x7b],
  [0x47, 0x2e, 0x7c],
  [0x47, 0x2f, 0x7d],
  [0x46, 0x30, 0x7e],
  [0x46, 0x32, 0x7e],
  [0x46, 0x33, 0x7f],
  [0x46, 0x34, 0x80],
  [0x45, 0x35, 0x81],
  [0x45, 0x37, 0x81],
  [0x45, 0x38, 0x82],
  [0x44, 0x39, 0x83],
  [0x44, 0x3a, 0x83],
  [0x44, 0x3b, 0x84],
  [0x43, 0x3d, 0x84],
  [0x43, 0x3e, 0x85],
  [0x42, 0x3f, 0x85],
  [0x42, 0x40, 0x86],
  [0x42, 0x41, 0x86],
  [0x41, 0x42, 0x87],
  [0x41, 0x44, 0x87],
  [0x40, 0x45, 0x88],
  [0x40, 0x46, 0x88],
  [0x3f, 0x47, 0x88],
  [0x3f, 0x48, 0x89],
  [0x3e, 0x49, 0x89],
  [0x3e, 0x4a, 0x89],
  [0x3e, 0x4c, 0x8a],
  [0x3d, 0x4d, 0x8a],
  [0x3d, 0x4e, 0x8a],
  [0x3c, 0x4f, 0x8a],
  [0x3c, 0x50, 0x8b],
  [0x3b, 0x51, 0x8b],
  [0x3b, 0x52, 0x8b],
  [0x3a, 0x53, 0x8b],
  [0x3a, 0x54, 0x8c],
  [0x39, 0x55, 0x8c],
  [0x39, 0x56, 0x8c],
  [0x38, 0x58, 0x8c],
  [0x38, 0x59, 0x8c],
  [0x37, 0x5a, 0x8c],
  [0x37, 0x5b, 0x8d],
  [0x36, 0x5c, 0x8d],
  [0x36, 0x5d, 0x8d],
  [0x35, 0x5e, 0x8d],
  [0x35, 0x5f, 0x8d],
  [0x34, 0x60, 0x8d],
  [0x34, 0x61, 0x8d],
  [0x33, 0x62, 0x8d],
  [0x33, 0x63, 0x8d],
  [0x32, 0x64, 0x8e],
  [0x32, 0x65, 0x8e],
  [0x31, 0x66, 0x8e],
  [0x31, 0x67, 0x8e],
  [0x31, 0x68, 0x8e],
  [0x30, 0x69, 0x8e],
  [0x30, 0x6a, 0x8e],
  [0x2f, 0x6b, 0x8e],
  [0x2f, 0x6c, 0x8e],
  [0x2e, 0x6d, 0x8e],
  [0x2e, 0x6e, 0x8e],
  [0x2e, 0x6f, 0x8e],
  [0x2d, 0x70, 0x8e],
  [0x2d, 0x71, 0x8e],
  [0x2c, 0x71, 0x8e],
  [0x2c, 0x72, 0x8e],
  [0x2c, 0x73, 0x8e],
  [0x2b, 0x74, 0x8e],
  [0x2b, 0x75, 0x8e],
  [0x2a, 0x76, 0x8e],
  [0x2a, 0x77, 0x8e],
  [0x2a, 0x78, 0x8e],
  [0x29, 0x79, 0x8e],
  [0x29, 0x7a, 0x8e],
  [0x29, 0x7b, 0x8e],
  [0x28, 0x7c, 0x8e],
  [0x28, 0x7d, 0x8e],
  [0x27, 0x7e, 0x8e],
  [0x27, 0x7f, 0x8e],
  [0x27, 0x80, 0x8e],
  [0x26, 0x81, 0x8e],
  [0x26, 0x82, 0x8e],
  [0x26, 0x82, 0x8e],
  [0x25, 0x83, 0x8e],
  [0x25, 0x84, 0x8e],
  [0x25, 0x85, 0x8e],
  [0x24, 0x86, 0x8e],
  [0x24, 0x87, 0x8e],
  [0x23, 0x88, 0x8e],
  [0x23, 0x89, 0x8e],
  [0x23, 0x8a, 0x8d],
  [0x22, 0x8b, 0x8d],
  [0x22, 0x8c, 0x8d],
  [0x22, 0x8d, 0x8d],
  [0x21, 0x8e, 0x8d],
  [0x21, 0x8f, 0x8d],
  [0x21, 0x90, 0x8d],
  [0x21, 0x91, 0x8c],
  [0x20, 0x92, 0x8c],
  [0x20, 0x92, 0x8c],
  [0x20, 0x93, 0x8c],
  [0x1f, 0x94, 0x8c],
  [0x1f, 0x95, 0x8b],
  [0x1f, 0x96, 0x8b],
  [0x1f, 0x97, 0x8b],
  [0x1f, 0x98, 0x8b],
  [0x1f, 0x99, 0x8a],
  [0x1f, 0x9a, 0x8a],
  [0x1e, 0x9b, 0x8a],
  [0x1e, 0x9c, 0x89],
  [0x1e, 0x9d, 0x89],
  [0x1f, 0x9e, 0x89],
  [0x1f, 0x9f, 0x88],
  [0x1f, 0xa0, 0x88],
  [0x1f, 0xa1, 0x88],
  [0x1f, 0xa1, 0x87],
  [0x1f, 0xa2, 0x87],
  [0x20, 0xa3, 0x86],
  [0x20, 0xa4, 0x86],
  [0x21, 0xa5, 0x85],
  [0x21, 0xa6, 0x85],
  [0x22, 0xa7, 0x85],
  [0x22, 0xa8, 0x84],
  [0x23, 0xa9, 0x83],
  [0x24, 0xaa, 0x83],
  [0x25, 0xab, 0x82],
  [0x25, 0xac, 0x82],
  [0x26, 0xad, 0x81],
  [0x27, 0xad, 0x81],
  [0x28, 0xae, 0x80],
  [0x29, 0xaf, 0x7f],
  [0x2a, 0xb0, 0x7f],
  [0x2c, 0xb1, 0x7e],
  [0x2d, 0xb2, 0x7d],
  [0x2e, 0xb3, 0x7c],
  [0x2f, 0xb4, 0x7c],
  [0x31, 0xb5, 0x7b],
  [0x32, 0xb6, 0x7a],
  [0x34, 0xb6, 0x79],
  [0x35, 0xb7, 0x79],
  [0x37, 0xb8, 0x78],
  [0x38, 0xb9, 0x77],
  [0x3a, 0xba, 0x76],
  [0x3b, 0xbb, 0x75],
  [0x3d, 0xbc, 0x74],
  [0x3f, 0xbc, 0x73],
  [0x40, 0xbd, 0x72],
  [0x42, 0xbe, 0x71],
  [0x44, 0xbf, 0x70],
  [0x46, 0xc0, 0x6f],
  [0x48, 0xc1, 0x6e],
  [0x4a, 0xc1, 0x6d],
  [0x4c, 0xc2, 0x6c],
  [0x4e, 0xc3, 0x6b],
  [0x50, 0xc4, 0x6a],
  [0x52, 0xc5, 0x69],
  [0x54, 0xc5, 0x68],
  [0x56, 0xc6, 0x67],
  [0x58, 0xc7, 0x65],
  [0x5a, 0xc8, 0x64],
  [0x5c, 0xc8, 0x63],
  [0x5e, 0xc9, 0x62],
  [0x60, 0xca, 0x60],
  [0x63, 0xcb, 0x5f],
  [0x65, 0xcb, 0x5e],
  [0x67, 0xcc, 0x5c],
  [0x69, 0xcd, 0x5b],
  [0x6c, 0xcd, 0x5a],
  [0x6e, 0xce, 0x58],
  [0x70, 0xcf, 0x57],
  [0x73, 0xd0, 0x56],
  [0x75, 0xd0, 0x54],
  [0x77, 0xd1, 0x53],
  [0x7a, 0xd1, 0x51],
  [0x7c, 0xd2, 0x50],
  [0x7f, 0xd3, 0x4e],
  [0x81, 0xd3, 0x4d],
  [0x84, 0xd4, 0x4b],
  [0x86, 0xd5, 0x49],
  [0x89, 0xd5, 0x48],
  [0x8b, 0xd6, 0x46],
  [0x8e, 0xd6, 0x45],
  [0x90, 0xd7, 0x43],
  [0x93, 0xd7, 0x41],
  [0x95, 0xd8, 0x40],
  [0x98, 0xd8, 0x3e],
  [0x9b, 0xd9, 0x3c],
  [0x9d, 0xd9, 0x3b],
  [0xa0, 0xda, 0x39],
  [0xa2, 0xda, 0x37],
  [0xa5, 0xdb, 0x36],
  [0xa8, 0xdb, 0x34],
  [0xaa, 0xdc, 0x32],
  [0xad, 0xdc, 0x30],
  [0xb0, 0xdd, 0x2f],
  [0xb2, 0xdd, 0x2d],
  [0xb5, 0xde, 0x2b],
  [0xb8, 0xde, 0x29],
  [0xba, 0xde, 0x28],
  [0xbd, 0xdf, 0x26],
  [0xc0, 0xdf, 0x25],
  [0xc2, 0xdf, 0x23],
  [0xc5, 0xe0, 0x21],
  [0xc8, 0xe0, 0x20],
  [0xca, 0xe1, 0x1f],
  [0xcd, 0xe1, 0x1d],
  [0xd0, 0xe1, 0x1c],
  [0xd2, 0xe2, 0x1b],
  [0xd5, 0xe2, 0x1a],
  [0xd8, 0xe2, 0x19],
  [0xda, 0xe3, 0x19],
  [0xdd, 0xe3, 0x18],
  [0xdf, 0xe3, 0x18],
  [0xe2, 0xe4, 0x18],
  [0xe5, 0xe4, 0x19],
  [0xe7, 0xe4, 0x19],
  [0xea, 0xe5, 0x1a],
  [0xec, 0xe5, 0x1b],
  [0xef, 0xe5, 0x1c],
  [0xf1, 0xe5, 0x1d],
  [0xf4, 0xe6, 0x1e],
  [0xf6, 0xe6, 0x20],
  [0xf8, 0xe6, 0x21],
  [0xfb, 0xe7, 0x23],
  [0xfd, 0xe7, 0x25]
];
