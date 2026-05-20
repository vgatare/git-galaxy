attribute vec3 starColor;
attribute float starSize;
attribute float starSeed;
attribute float starId;
attribute float starVisible;

uniform float uTime;
uniform float uPixelRatio;
uniform float uViewport;
uniform float uHighlightId;

varying vec3 vColor;
varying float vTwinkle;
varying float vHighlight;
varying float vVisible;

void main() {
  vColor = starColor;
  vVisible = starVisible;

  float t = uTime * 0.6 + starSeed * 6.2831;
  vTwinkle = 0.78 + 0.22 * sin(t) * cos(t * 0.31 + starSeed * 4.0);

  vHighlight = step(abs(starId - uHighlightId), 0.5);

  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;

  float dist = -mv.z;
  float baseSize = starSize * 55.0 * uPixelRatio;
  float perspective = uViewport / max(1.0, dist);
  float highlightBoost = 1.0 + vHighlight * 1.8;
  gl_PointSize = clamp(baseSize * perspective * highlightBoost, 1.2, 180.0) * starVisible;
}
