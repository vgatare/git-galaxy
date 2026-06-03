precision highp float;

uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform vec2 uBHPositions[4];
uniform float uBHMasses[4];
uniform float uTime;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / uResolution.y;
  float darken = 1.0;
  vec3 glow = vec3(0.0);

  for (int i = 0; i < 4; i++) {
    float mass = uBHMasses[i];
    if (mass < 0.001) continue;

    vec2 bhPos = uBHPositions[i];
    vec2 delta = uv - bhPos;
    delta.x *= aspect;

    float dist = length(delta);
    vec2 dir = dist > 0.0001 ? delta / dist : vec2(0.0);

    // Gravitational lensing distortion
    float schwarzschild = mass * 0.015;
    float deflection = schwarzschild * schwarzschild / (dist * dist + schwarzschild * 0.4);

    dir.x /= aspect;
    uv += dir * deflection;

    // Event horizon darkening
    float horizon = smoothstep(schwarzschild * 0.2, schwarzschild * 1.5, dist);
    darken *= horizon;

    // Photon sphere glow
    float photonRing = smoothstep(schwarzschild * 1.8, schwarzschild * 0.4, dist)
                     * smoothstep(schwarzschild * 0.15, schwarzschild * 0.5, dist);
    glow += vec3(0.25, 0.45, 1.0) * photonRing * mass * 0.6;

    // Einstein ring
    float einsteinRing = exp(-pow((dist - schwarzschild * 1.2) * 12.0, 2.0));
    glow += vec3(0.6, 0.8, 1.0) * einsteinRing * mass * 0.15;
  }

  vec4 color = texture2D(tDiffuse, clamp(uv, 0.0, 1.0));
  color.rgb *= darken;
  color.rgb += glow;

  gl_FragColor = color;
}
