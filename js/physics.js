import { clamp, randomBetween } from './utils.js';
import { logoCanSound } from './logo.js';

export function updatePhysics(dt, sceneCtx) {
  const { logos, width, height, state, audio, stars } = sceneCtx;

  for (const logo of logos) {
    if (logo.locked) {
      continue;
    }

    logo.hitCooldown = Math.max(0, logo.hitCooldown - dt);

    if (stars && stars.length > 0) {
      const cx = logo.x + logo.w / 2;
      const cy = logo.y + logo.h / 2;
      for (const star of stars) {
        const dx = star.x - cx;
        const dy = star.y - cy;
        const d2 = dx * dx + dy * dy + 400;
        const accel = (star.mass || 220000) / d2;
        const d = Math.sqrt(d2);
        logo.vx += (accel * dx) / d * dt;
        logo.vy += (accel * dy) / d * dt;
      }
      const speed = Math.hypot(logo.vx, logo.vy);
      const maxSpeed = 1400;
      if (speed > maxSpeed) {
        logo.vx = (logo.vx / speed) * maxSpeed;
        logo.vy = (logo.vy / speed) * maxSpeed;
      }
    }

    logo.x += logo.vx * dt;
    logo.y += logo.vy * dt;

    const maxX = width - logo.w;
    const maxY = height - logo.h;

    let bouncedX = false;
    let bouncedY = false;
    if (logo.x <= 0) {
      logo.x = 0;
      logo.vx = Math.abs(logo.vx);
      bouncedX = true;
    } else if (logo.x >= maxX) {
      logo.x = maxX;
      logo.vx = -Math.abs(logo.vx);
      bouncedX = true;
    }

    if (logo.y <= 0) {
      logo.y = 0;
      logo.vy = Math.abs(logo.vy);
      bouncedY = true;
    } else if (logo.y >= maxY) {
      logo.y = maxY;
      logo.vy = -Math.abs(logo.vy);
      bouncedY = true;
    }

    const bounced = bouncedX || bouncedY;

    const CORNER_MARGIN = 15;
    const nearEdgeX = logo.x <= CORNER_MARGIN || logo.x >= maxX - CORNER_MARGIN;
    const nearEdgeY = logo.y <= CORNER_MARGIN || logo.y >= maxY - CORNER_MARGIN;
    const cornerHit = (bouncedX && bouncedY) ||
      (bouncedX && nearEdgeY) ||
      (bouncedY && nearEdgeX);

    if (bounced) {
      logo.hue = (logo.hue + randomBetween(50, 120)) % 360;
    }

    if (bounced && logo.hitCooldown <= 0) {
      logo.hitCooldown = 0.03;
      const intensity = clamp(logo.speed / 520, 0.1, 1.2);
      if (logoCanSound(logo, logos)) {
        audio.triggerBounce(logo, cornerHit ? 1.2 : intensity, cornerHit ? 'corner' : 'wall');
      }
    }

    if (logo.trail === 'off') {
      logo.history.length = 0;
    } else {
      logo.history.push({ x: logo.cx, y: logo.cy, w: logo.w, h: logo.h });
      const baseTrail = logo.trailLength ?? (logo.trail === 'line' ? 52 : 16);
      const maxTrail = Math.max(2, Math.round(baseTrail * state.trailQuality));
      if (logo.history.length > maxTrail) {
        logo.history.splice(0, logo.history.length - maxTrail);
      }
    }
  }

  if (state.collisionsEnabled) {
    resolveLogoCollisions(sceneCtx);
  }
}

function resolveLogoCollisions(sceneCtx) {
  const { logos, audio } = sceneCtx;

  for (let i = 0; i < logos.length; i += 1) {
    for (let j = i + 1; j < logos.length; j += 1) {
      const a = logos[i];
      const b = logos[j];
      if (a.locked && b.locked) {
        continue;
      }

      const dx = b.cx - a.cx;
      const dy = b.cy - a.cy;
      const distance = Math.hypot(dx, dy);
      const minDistance = Math.max(a.w, a.h) * 0.35 + Math.max(b.w, b.h) * 0.35;

      if (distance === 0 || distance >= minDistance) {
        continue;
      }

      const nx = dx / distance;
      const ny = dy / distance;

      const overlap = minDistance - distance;
      const aMove = a.locked ? 0 : b.locked ? 1 : 0.5;
      const bMove = b.locked ? 0 : a.locked ? 1 : 0.5;
      a.x -= nx * overlap * aMove;
      a.y -= ny * overlap * aMove;
      b.x += nx * overlap * bMove;
      b.y += ny * overlap * bMove;

      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const velAlongNormal = rvx * nx + rvy * ny;
      if (velAlongNormal > 0) {
        continue;
      }

      const restitution = 0.96;
      const impulse = (-(1 + restitution) * velAlongNormal) / 2;

      if (!a.locked) {
        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
      }
      if (!b.locked) {
        b.vx += impulse * nx;
        b.vy += impulse * ny;
      }

      const intensity = clamp(Math.abs(velAlongNormal) / 620, 0.06, 1.2);
      if (a.hitCooldown <= 0 && logoCanSound(a, logos)) {
        a.hitCooldown = 0.03;
        audio.triggerBounce(a, intensity, 'collision');
      }
      if (b.hitCooldown <= 0 && logoCanSound(b, logos)) {
        b.hitCooldown = 0.03;
        audio.triggerBounce(b, intensity, 'collision');
      }
    }
  }
}
