varying vec3 vWorldDir;

void main() {
  // Render a screen-filling triangle/quad using clip-space positions.
  vWorldDir = normalize((vec4(position, 0.0)).xyz);
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
