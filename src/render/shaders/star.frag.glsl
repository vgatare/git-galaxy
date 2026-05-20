precision highp float;

varying vec3 vColor;
varying float vTwinkle;
varying float vHighlight;
varying float vVisible;

void main() {
  if (vVisible < 0.5) discard;

  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float r = length(uv);
  if (r > 1.0) discard;

  float core = smoothstep(0.32, 0.0, r);
  float halo = pow(max(0.0, 1.0 - r), 3.0) * 0.55;

  float spike =
    pow(max(0.0, 1.0 - abs(uv.x) * 10.0), 16.0) +
    pow(max(0.0, 1.0 - abs(uv.y) * 10.0), 16.0);
  spike *= 0.25;

  float intensity = (core * 1.1 + halo + spike) * vTwinkle;

  vec3 hot = mix(vColor, vec3(1.0), core * 0.6);

  float ring = smoothstep(0.86, 0.78, r) - smoothstep(0.98, 0.92, r);
  vec3 finalColor = hot * intensity + vec3(1.0) * ring * vHighlight * 1.6;

  float alpha = clamp(intensity * 0.85 + ring * vHighlight, 0.0, 1.0);
  if (alpha < 0.01) discard;

  gl_FragColor = vec4(finalColor, alpha);
}
