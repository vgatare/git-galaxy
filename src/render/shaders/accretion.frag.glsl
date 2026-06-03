precision highp float;

varying vec2 vUv;
uniform float uTime;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise2(p);
    p *= 2.1;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 centered = vUv * 2.0 - 1.0;
  float r = length(centered);
  float angle = atan(centered.y, centered.x);

  // Ring shape with soft edges
  float inner = smoothstep(0.25, 0.4, r);
  float outer = smoothstep(1.0, 0.65, r);
  float ring = inner * outer;
  if (ring < 0.01) discard;

  // Orbital rotation
  float rotAngle = angle + uTime * 1.2;

  // Turbulence
  vec2 nc = vec2(rotAngle * 2.0, r * 6.0);
  float turb = fbm(nc + uTime * 0.3);

  // Temperature gradient: hot inner edge, cool outer
  float temp = 1.0 - smoothstep(0.25, 0.85, r);

  // Doppler effect: one side brighter (approaching)
  float doppler = 0.65 + 0.35 * sin(angle + uTime * 0.8);

  // Color palette
  vec3 hot  = vec3(1.0, 0.95, 0.85);
  vec3 warm = vec3(1.0, 0.55, 0.15);
  vec3 cool = vec3(0.7, 0.15, 0.05);

  vec3 col = mix(cool, warm, temp);
  col = mix(col, hot, temp * temp);
  col *= (0.5 + turb * 0.8) * doppler;

  float alpha = ring * (0.4 + turb * 0.6) * doppler;

  gl_FragColor = vec4(col * 1.8, alpha);
}
