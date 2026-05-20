precision highp float;

uniform float uTime;
uniform vec2 uResolution;

// Hash & value-noise utilities.
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
  for (int i = 0; i < 5; i++) {
    v += a * noise2(p);
    p *= 2.05;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (frag - 0.5 * uResolution) / min(uResolution.x, uResolution.y);

  // Deep space gradient.
  float radial = length(uv);
  vec3 base = mix(vec3(0.012, 0.018, 0.045), vec3(0.0, 0.0, 0.0), smoothstep(0.0, 1.2, radial));

  // Two layers of nebula at different scales and hues.
  float n1 = fbm(uv * 2.4 + vec2(uTime * 0.012, -uTime * 0.008));
  float n2 = fbm(uv * 5.0 + vec2(-uTime * 0.018, uTime * 0.011));
  float cloud = pow(n1 * 0.7 + n2 * 0.3, 1.6);

  vec3 hueA = vec3(0.18, 0.32, 0.85); // blue
  vec3 hueB = vec3(0.62, 0.20, 0.85); // violet
  vec3 hueC = vec3(0.95, 0.45, 0.75); // pink

  vec3 nebula = mix(hueA, hueB, smoothstep(0.25, 0.7, n1));
  nebula = mix(nebula, hueC, smoothstep(0.55, 0.9, n2));

  vec3 col = base + nebula * cloud * 0.45;

  // Background star sprinkle.
  vec2 sp = frag * 1.0;
  float starHash = hash21(floor(sp / 2.0));
  float starMask = step(0.9975, starHash);
  float twinkle = 0.7 + 0.3 * sin(uTime * 2.0 + starHash * 60.0);
  col += vec3(1.0) * starMask * twinkle * 0.9;

  // Subtle vignette so HUD stays readable.
  float vignette = smoothstep(1.2, 0.2, radial);
  col *= mix(0.55, 1.05, vignette);

  gl_FragColor = vec4(col, 1.0);
}
