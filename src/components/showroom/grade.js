import { ShaderChunk } from "three";

// The look of Blender's "AgX - Medium High Contrast" renders, as the gallery's
// (../gallery/Scene.jsx): AgX tone mapping, then a small contrast lift on the
// display values, in every material's own shader rather than a post pass.
ShaderChunk.tonemapping_fragment = `
#if defined( TONE_MAPPING )
  gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
  vec3 graded = ( pow( max( gl_FragColor.rgb, 0.0 ), vec3( 1.0 / 2.2 ) ) - 0.52 ) / 0.84 + 0.5;
  gl_FragColor.rgb = pow( max( graded, 0.0 ), vec3( 2.2 ) );
#endif
`;
