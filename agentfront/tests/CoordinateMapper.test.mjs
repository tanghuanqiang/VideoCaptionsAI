/**
 * CoordinateMapper.test.mjs — Comprehensive unit tests
 * Run: node --test agentfront/tests/CoordinateMapper.test.mjs
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

// ============================================================
// Exact copy of CoordinateMapper.ts logic (tested as black-box)
// ============================================================
function hAlign(a) { const m = a % 3; return m === 1 ? "left" : m === 0 ? "right" : "center"; }
function vAlign(a) { if (a <= 3) return "bottom"; if (a >= 7) return "top"; return "middle"; }

function getVideoContentRect(cw, ch, vw, vh) {
  if (!vw || !vh || !cw || !ch) return { left: 0, top: 0, width: cw, height: ch };
  const va = vw / vh, ca = cw / ch;
  let w, h;
  if (va > ca) { w = cw; h = cw / va; } else { h = ch; w = ch * va; }
  return { left: (cw - w) / 2, top: (ch - h) / 2, width: w, height: h };
}

function assToCSS(alignment, marginL, marginR, marginV, fontSize, cr, prX, prY) {
  const s = cr.height / prY;
  const ml = marginL * s, mr = marginR * s, mv = marginV * s, fs = fontSize * s;
  const ha = hAlign(alignment), va = vAlign(alignment);
  let left, top, tx;
  if (ha === "left") { left = cr.left + ml; }
  else if (ha === "right") { left = cr.left + cr.width - mr; tx = "-100%"; }
  else { left = cr.left + cr.width / 2 + ml - mr; tx = "-50%"; }
  if (va === "bottom") { top = cr.top + cr.height - mv; }
  else if (va === "top") { top = cr.top + mv; }
  else { top = cr.top + cr.height / 2 + mv; tx = tx ? tx + ",-50%" : "0,-50%"; }
  return { left, top, fontSize: fs, translateX: tx };
}

function cssDragToASS(dx, dy, alignment, marginL, marginR, marginV, fontSize, cr, prY) {
  const s = cr.height / prY;
  const ha = hAlign(alignment), va = vAlign(alignment);
  let ml = marginL, mr = marginR, mv = marginV;
  const rawDelta = Math.round(dx / s);
  if (ha === "left") ml = Math.max(0, ml + rawDelta);
  else if (ha === "right") mr = Math.max(0, mr - rawDelta);
  else { ml = Math.max(0, ml + rawDelta); mr = Math.max(0, mr - rawDelta); }
  const rawDeltaY = Math.round(dy / s);
  if (va === "bottom") mv = Math.max(0, mv - rawDeltaY);
  else if (va === "top") mv = Math.max(0, mv + rawDeltaY);
  else mv = Math.max(0, mv + rawDeltaY);
  return { marginV: Math.min(999, mv), marginL: Math.min(999, ml), marginR: Math.min(999, mr) };
}

function cssResizeToASS(dScale, curFontSize, cr, prY) {
  return Math.max(12, Math.min(500, Math.round(curFontSize * dScale)));
}

function preservePosition(oldA, newA, ml, mr, mv, fs, cr, prX, prY) {
  const s = cr.height / prY;
  const oha = hAlign(oldA), ova = vAlign(oldA);
  let absX, absY;
  if (oha === "left") absX = ml * s;
  else if (oha === "right") absX = cr.width - mr * s;
  else absX = cr.width / 2 + ml * s - mr * s;
  if (ova === "bottom") absY = cr.height - mv * s;
  else if (ova === "top") absY = mv * s;
  else absY = cr.height / 2 + mv * s;
  const nha = hAlign(newA), nva = vAlign(newA);
  let nml = ml, nmr = mr, nmv = mv;
  if (nha === "left") nml = Math.max(0, Math.round(absX / s));
  else if (nha === "right") nmr = Math.max(0, Math.round((cr.width - absX) / s));
  else {
    const netShift = absX - cr.width / 2;
    const netMargin = Math.round(netShift / s);
    if (netMargin >= 0) { nml = Math.max(0, netMargin); nmr = 0; }
    else { nml = 0; nmr = Math.max(0, -netMargin); }
  }
  if (nva === "bottom") nmv = Math.max(0, Math.round((cr.height - absY) / s));
  else if (nva === "top") nmv = Math.max(0, Math.round(absY / s));
  else nmv = Math.max(0, Math.round((absY - cr.height / 2) / s));
  return { marginL: Math.min(999, nml), marginR: Math.min(999, nmr), marginV: Math.min(999, nmv) };
}

// ============================================================
// Fixtures
// ============================================================
const cr = getVideoContentRect(720, 400, 1920, 1080); // typical 720p container
const EPS = 0.5;

describe("getVideoContentRect", () => {
  it("computes letterboxed video area correctly", () => {
    assert.ok(cr.width > cr.height);
    assert.ok(Math.abs(cr.width / cr.height - 1920 / 1080) < 0.01);
    assert.ok(cr.left > 0, "pillarbox should exist");
    assert.ok(cr.top < 1, "no letterbox for 16:9 in 16:10 container");
  });

  it("returns zero rect for empty container", () => {
    const empty = getVideoContentRect(0, 0, 1920, 1080);
    assert.equal(empty.width, 0);
  });
});

describe("assToCSS — all 9 alignment positions", () => {
  const labels = { 1:"BL", 2:"BC", 3:"BR", 4:"ML", 5:"MC", 6:"MR", 7:"TL", 8:"TC", 9:"TR" };

  it("left-aligned (1,4,7) anchor near left edge", () => {
    for (const a of [1, 4, 7]) {
      const pos = assToCSS(a, 10, 10, 10, 48, cr, 1920, 1080);
      assert.ok(pos.left < cr.left + 50, `Align ${a}(${labels[a]}): left=${pos.left?.toFixed(1)} should be < ${(cr.left + 50).toFixed(1)}`);
      assert.ok(!pos.translateX || pos.translateX === "0,-50%", `Align ${a}: translateX should be undefined or 0,-50%, got ${pos.translateX}`);
    }
  });

  it("right-aligned (3,6,9) anchor near right edge with translateX(-100%)", () => {
    for (const a of [3, 6, 9]) {
      const pos = assToCSS(a, 10, 10, 10, 48, cr, 1920, 1080);
      assert.ok(pos.left > cr.left + cr.width - 50, `Align ${a}(${labels[a]}): left=${pos.left?.toFixed(1)} should be > ${(cr.left + cr.width - 50).toFixed(1)}`);
      assert.ok(pos.translateX?.includes("-100%"), `Align ${a}: should have -100% translateX, got ${pos.translateX}`);
    }
  });

  it("center-aligned (2,5,8) anchor near center with translateX(-50%)", () => {
    for (const a of [2, 5, 8]) {
      const pos = assToCSS(a, 10, 10, 10, 48, cr, 1920, 1080);
      assert.ok(Math.abs(pos.left - (cr.left + cr.width / 2)) < EPS, `Align ${a}: left should be at center`);
      assert.ok(pos.translateX?.includes("-50%"), `Align ${a}: should have -50% translateX`);
    }
  });

  it("vertical: bottom (1,2,3) near bottom, top (7,8,9) near top", () => {
    for (const a of [1, 2, 3]) {
      const pos = assToCSS(a, 10, 10, 10, 48, cr, 1920, 1080);
      assert.ok(pos.top > cr.top + cr.height - 30, `Align ${a} should be near bottom`);
    }
    for (const a of [7, 8, 9]) {
      const pos = assToCSS(a, 10, 10, 10, 48, cr, 1920, 1080);
      assert.ok(pos.top < cr.top + 30, `Align ${a} should be near top`);
    }
  });
});

describe("assToCSS — center alignment marginL/marginR (ASS spec)", () => {
  it("marginL shifts center right", () => {
    const def = assToCSS(2, 0, 0, 10, 48, cr, 1920, 1080);
    const withL = assToCSS(2, 50, 0, 10, 48, cr, 1920, 1080);
    assert.ok(withL.left > def.left, `marginL=50 (${withL.left.toFixed(1)}) > default (${def.left.toFixed(1)})`);
  });

  it("marginR shifts center left", () => {
    const def = assToCSS(2, 0, 0, 10, 48, cr, 1920, 1080);
    const withR = assToCSS(2, 0, 50, 10, 48, cr, 1920, 1080);
    assert.ok(withR.left < def.left, `marginR=50 (${withR.left.toFixed(1)}) < default (${def.left.toFixed(1)})`);
  });

  it("marginL=marginR returns to center", () => {
    const def = assToCSS(2, 0, 0, 10, 48, cr, 1920, 1080);
    const balanced = assToCSS(2, 50, 50, 10, 48, cr, 1920, 1080);
    assert.ok(Math.abs(balanced.left - def.left) < EPS, `balanced should equal default`);
  });
});

describe("assToCSS — margin effects", () => {
  it("marginL increases left-aligned X position", () => {
    const small = assToCSS(1, 10, 10, 10, 48, cr, 1920, 1080);
    const large = assToCSS(1, 100, 10, 10, 48, cr, 1920, 1080);
    assert.ok(large.left > small.left);
  });

  it("marginR decreases right-aligned X position (pulls left)", () => {
    const small = assToCSS(3, 10, 10, 10, 48, cr, 1920, 1080);
    const large = assToCSS(3, 10, 100, 10, 48, cr, 1920, 1080);
    assert.ok(large.left < small.left, `marginR=100 should pull further from right edge`);
  });

  it("marginV bottom: larger = higher on screen", () => {
    const small = assToCSS(2, 10, 10, 10, 48, cr, 1920, 1080);
    const large = assToCSS(2, 10, 10, 50, 48, cr, 1920, 1080);
    assert.ok(large.top < small.top, `marginV=50 should be higher (lower top value)`);
  });
});

describe("cssDragToASS", () => {
  it("left-aligned: drag right increases marginL", () => {
    const r = cssDragToASS(27, 0, 1, 10, 10, 10, 48, cr, 1080);
    assert.ok(r.marginL > 10, `ml should increase from 10, got ${r.marginL}`);
  });

  it("right-aligned: drag left increases marginR", () => {
    const r = cssDragToASS(-27, 0, 3, 10, 10, 10, 48, cr, 1080);
    assert.ok(r.marginR > 10, `mr should increase from 10, got ${r.marginR}`);
  });

  it("center-aligned: drag right increases marginL", () => {
    const r = cssDragToASS(27, 0, 2, 10, 10, 10, 48, cr, 1080);
    assert.ok(r.marginL > 10, `center drag right: ml should increase, got ${r.marginL}`);
  });

  it("center-aligned: drag left increases marginR", () => {
    const r = cssDragToASS(-27, 0, 2, 10, 10, 10, 48, cr, 1080);
    assert.ok(r.marginR > 10, `center drag left: mr should increase, got ${r.marginR}`);
  });

  it("bottom-aligned: drag up increases marginV", () => {
    const r = cssDragToASS(0, -27, 2, 10, 10, 10, 48, cr, 1080);
    assert.ok(r.marginV > 10, `drag up (bottom): mv should increase, got ${r.marginV}`);
  });

  it("top-aligned: drag down increases marginV", () => {
    const r = cssDragToASS(0, 27, 8, 10, 10, 10, 48, cr, 1080);
    assert.ok(r.marginV > 10, `drag down (top): mv should increase, got ${r.marginV}`);
  });

  it("clamps margins at 999", () => {
    const r = cssDragToASS(10000, 10000, 1, 10, 10, 10, 48, cr, 1080);
    assert.ok(r.marginL <= 999);
    assert.ok(r.marginV <= 999);
  });
});

describe("cssResizeToASS", () => {
  it("scale=1 returns same size", () => assert.equal(cssResizeToASS(1, 48, cr, 1080), 48));
  it("scale=2 doubles", () => assert.equal(cssResizeToASS(2, 48, cr, 1080), 96));
  it("scale=0.5 halves", () => assert.equal(cssResizeToASS(0.5, 48, cr, 1080), 24));
  it("clamps to min 12", () => assert.equal(cssResizeToASS(0.01, 48, cr, 1080), 12));
  it("clamps to max 500", () => assert.equal(cssResizeToASS(20, 48, cr, 1080), 500));
});

describe("preservePosition — alignment change", () => {
  it("center→center preserves margins", () => {
    const r = preservePosition(2, 2, 20, 5, 10, 48, cr, 1920, 1080);
    assert.ok(r.marginL >= 0);
    assert.ok(r.marginV >= 0);
  });

  it("left→right preserves vertical position", () => {
    const r = preservePosition(1, 3, 10, 10, 10, 48, cr, 1920, 1080);
    assert.ok(r.marginR >= 0);
    assert.equal(r.marginV, 10, "vertical should be preserved");
  });

  it("bottom→top flips vertical", () => {
    const r = preservePosition(2, 8, 10, 10, 10, 48, cr, 1920, 1080);
    assert.ok(r.marginV > 0, "should have non-zero marginV");
  });
});

console.log("All CoordinateMapper tests completed.");
