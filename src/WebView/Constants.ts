
export const InternalParameters: Set<string> = new Set([ 'iTime', 'iResolution', 'iMouse', 'iVirtualProjectionMatrix', 'iVirtualModelViewMatrix', 'iVirtualWorldInverseMatrix', 'iVirtualProjectionInverseMatrix', 'iVirtualWorldMatrix' ]);

export const VertexShaderReservedNames: { [key:string]: string } = {
    modelMatrix: 'mat4',
    modelViewMatrix: 'mat4',
    projectionMatrix: 'mat4',
    viewMatrix: 'mat4',
    normalMatrix: 'mat3',
    cameraPosition: 'vec3'
};
