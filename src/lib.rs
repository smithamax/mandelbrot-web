mod utils;

use wasm_bindgen::prelude::*;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
extern "C" {
    fn alert(s: &str);
}

#[wasm_bindgen]
pub fn add(a: f64, b: f64) -> Box<[f64]> {
    let mut vec = Vec::new();

    vec.push(a + b);

    return vec.into_boxed_slice();
}

#[wasm_bindgen]
pub fn calc(px: u32, py: u32, x_offset: f64, y_offset: f64, scale: f64, i_max: u32) -> u32 {
    let sx = px as f64 / scale + x_offset;
    let sy = py as f64 / scale + y_offset;

    let qx = sx - 0.25;
    let ysq = sy * sy;
    let q = qx * qx + ysq;
    if q * (q + qx) <= ysq / 4.0 {
        return i_max;
    }
    if (sx + 1.0) * (sx + 1.0) + ysq <= 1.0 / 16.0 {
        return i_max;
    }

    let mut x;
    let mut y;
    let mut i = 0;

    let mut rsquare = 0.0;
    let mut isquare = 0.0;
    let mut zsquare = 0.0;

    while rsquare + isquare <= 4.0 && i < i_max {
        x = rsquare - isquare + sx;
        y = zsquare - rsquare - isquare + sy;
        rsquare = x * x;
        isquare = y * y;
        zsquare = (x + y) * (x + y);

        i += 1;
    }

    return i;
}

#[wasm_bindgen]
pub fn calc_area(
    width: u32,
    height: u32,
    x_offset: f64,
    y_offset: f64,
    scale: f64,
    i_max: u32,
) -> Box<[u32]> {
    let mut vec = Vec::new();

    for py in 0..height {
        for px in 0..width {
            let i = calc(px, py, x_offset, y_offset, scale, i_max);
            vec.push(i);
        }
    }

    return vec.into_boxed_slice();
}
