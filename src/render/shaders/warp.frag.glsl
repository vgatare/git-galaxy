precision highp float;

uniform sampler2D tDiffuse;
uniform float uIntensity;
uniform float uTime;

varying vec2 vUv;

void main() {
  if (uIntensity < 0.001) {
    gl_FragColor = texture2D(tDiffuse, vUv);
    return;
  }

  vec2 center = vec2(0.5);
  vec2 toCenter = vUv - center;
  float dist = length(toCenter);
  vec2 dir = dist > 0.001 ? toCenter / dist : vec2(0.0);

  // Radial motion blur
  vec4 color = vec4(0.0);
  const int SAMPLES = 12;
  float blurAmount = uIntensity * 0.15;
  for (int i = 0; i < SAMPLES; i++) {
    float t = float(i) / float(SAMPLES - 1);
    vec2 sampleUV = vUv - dir * dist * t * blurAmount;
    color += texture2D(tDiffuse, clamp(sampleUV, 0.0, 1.0));
  }
  color /= float(SAMPLES);

  // Procedural star streaks at multiple frequencies
  float angle = atan(toCenter.y, toCenter.x);
  float s1 = pow(abs(sin(angle * 60.0 + uTime * 25.0)), 60.0);
  float s2 = pow(abs(sin(angle * 100.0 - uTime * 18.0)), 80.0);
  float s3 = pow(abs(sin(angle * 180.0 + uTime * 35.0)), 120.0);
  float streaks = s1 * 0.5 + s2 * 0.35 + s3 * 0.25;
  streaks *= smoothstep(0.05, 0.45, dist);

  // Chromatic aberration
  float aberration = uIntensity * 0.005;
  float r = texture2D(tDiffuse, clamp(vUv + dir * aberration * dist, 0.0, 1.0)).r;
  float b = texture2D(tDiffuse, clamp(vUv - dir * aberration * dist, 0.0, 1.0)).b;
  vec3 chroma = vec3(r, color.g, b);

  vec3 result = mix(color.rgb, chroma, uIntensity);

  // Streak glow
  vec3 streakColor = mix(vec3(0.4, 0.65, 1.0), vec3(0.9, 0.95, 1.0), streaks);
  result += streakColor * streaks * uIntensity * 2.0;

  // Brightness boost
  result *= 1.0 + uIntensity * 0.2;

  gl_FragColor = vec4(result, 1.0);
}
