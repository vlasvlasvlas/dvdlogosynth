import { LOGO_IMAGE_PATH } from './config.js';

let canvas;
let ctx;
let width = 0;
let height = 0;
let dpr = 1;

const logoImage = new Image();
let logoImageReady = false;
let logoMask = null;

logoImage.decoding = 'async';
logoImage.src = LOGO_IMAGE_PATH;
logoImage.onload = () => {
  logoImageReady = true;
  try {
    const offscreen = document.createElement('canvas');
    offscreen.width = logoImage.width;
    offscreen.height = logoImage.height;
    const offCtx = offscreen.getContext('2d');
    offCtx.drawImage(logoImage, 0, 0);

    const imgData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const brightness = (d[i] + d[i + 1] + d[i + 2]) / 3;
      const origAlpha = d[i + 3];
      const alpha = Math.round((origAlpha / 255) * (255 - brightness));
      d[i] = 255;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = alpha;
    }
    offCtx.putImageData(imgData, 0, 0);
    logoMask = offscreen;
  } catch (_) {
    logoMask = null;
  }
};
logoImage.onerror = () => {
  logoImageReady = false;
};

export function initRenderer(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
}

export function resizeCanvas(dprLimit) {
  dpr = Math.min(window.devicePixelRatio || 1, dprLimit);
  const rect = canvas.getBoundingClientRect();
  width = Math.max(1, Math.floor(rect.width));
  height = Math.max(1, Math.floor(rect.height));
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width, height, dpr };
}

export function getDimensions() {
  return { width, height, dpr };
}

export function getLogoAspectRatio() {
  if (logoImageReady && logoImage.width > 0 && logoImage.height > 0) {
    return logoImage.width / logoImage.height;
  }
  return 16 / 9;
}

function drawLogoImage(x, y, w, h, hue) {
  if (logoMask) {
    ctx.filter = `hue-rotate(${hue}deg)`;
    ctx.drawImage(logoMask, x, y, w, h);
    ctx.filter = 'none';
  } else if (logoImageReady) {
    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'screen';
    ctx.filter = `invert(1) sepia(1) saturate(20) hue-rotate(${hue}deg)`;
    ctx.drawImage(logoImage, x, y, w, h);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = prevOp;
  } else {
    ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.max(13, h * 0.33)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DVD', x + w * 0.5, y + h * 0.5);
  }
}

function drawTrail(logo) {
  if (logo.trail === 'off' || logo.history.length < 2) {
    return;
  }

  if (logo.trail === 'line') {
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = `hsla(${logo.hue}, 100%, 72%, 0.44)`;
    ctx.beginPath();
    for (let i = 0; i < logo.history.length; i += 1) {
      const p = logo.history[i];
      if (i === 0) {
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (logo.trail === 'ghost') {
    ctx.save();
    for (let i = 0; i < logo.history.length; i += 1) {
      const p = logo.history[i];
      const alpha = ((i + 1) / logo.history.length) * 0.14;
      const w = p.w * (1 - (logo.history.length - i) * 0.012);
      const h = p.h * (1 - (logo.history.length - i) * 0.012);

      ctx.globalAlpha = alpha;
      drawLogoImage(p.x - w / 2, p.y - h / 2, w, h, logo.hue);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}

function drawLogo(logo) {
  drawTrail(logo);
  ctx.save();
  drawLogoImage(logo.x, logo.y, logo.w, logo.h, logo.hue);
  ctx.restore();
}

export function drawFrame(logos) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  for (const logo of logos) {
    drawLogo(logo);
  }
}
