attribute float cometAlpha;
attribute vec3 cometColor;

uniform float uPixelRatio;

varying float vAlpha;
varying vec3 vColor;

void main() {
  vAlpha = cometAlpha;
  vColor = cometColor;

  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;

  float dist = -mv.z;
  float baseSize = mix(1.5, 5.0, cometAlpha) * uPixelRatio;
  float perspective = 400.0 / max(1.0, dist);
  gl_PointSize = clamp(baseSize * perspective, 0.5, 35.0) * step(0.01, cometAlpha);
}
