precision highp float;

varying float vAlpha;
varying vec3 vColor;

void main() {
  if (vAlpha < 0.01) discard;

  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float r = length(uv);
  if (r > 1.0) discard;

  float core = smoothstep(0.5, 0.0, r);
  float halo = pow(max(0.0, 1.0 - r), 2.0) * 0.4;
  float intensity = core + halo;

  vec3 color = mix(vColor, vec3(1.0), core * 0.5);
  float alpha = intensity * vAlpha;
  if (alpha < 0.01) discard;

  gl_FragColor = vec4(color * intensity, alpha);
}
