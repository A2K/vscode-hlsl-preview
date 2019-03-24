class BufferPreviewScene2D extends PreviewScene
{
    constructor(buffer)
    {
        super();

        this.DefaultVertexShader = document.getElementById('vertexShader').textContent;
        this.DefaultFragmentShader = document.getElementById('textureFragmentShader').textContent;

        this.buffer = buffer;

        this.controls = new ZoomControls($(window.renderer.renderer.domElement));
    }

    dispose()
    {
        if (this.controls)
        {
            this.controls.dispose();
            delete this.controls;
        }
        super.dispose();
    }

    onBeforeRender(renderer)
    {
        super.onBeforeRender(renderer);

        const texName = 'texture';

        this.uniforms.texture = {
            type: 't',
            value: this.buffer.renderTarget.texture
        };

        this.uniforms['_Globals'].value.iZoom = this.controls.zoom;
        this.uniforms['_Globals'].value.iZoomTarget = this.controls.zoomTarget;
        this.uniforms['_Globals'].value.iZoomAnimStartTime = this.controls.zoomAnimStartTime;
        this.uniforms['_Globals'].value.iZoomAnimDuration = this.controls.zoomAnimDuration;

        if (!(this.uniforms['_Globals'].value.iGridColor1 instanceof THREE.Vector3))
        {
            this.uniforms['_Globals'].value.iGridColor1 = new THREE.Vector3(0.2, 0.2, 0.2);
        }

        if (!(this.uniforms['_Globals'].value.iGridColor2 instanceof THREE.Vector3))
        {
            this.uniforms['_Globals'].value.iGridColor2 = new THREE.Vector3(0.3, 0.3, 0.3);
        }

        if (!(this.uniforms['_Globals'].value.iOffset instanceof THREE.Vector2))
        {
            this.uniforms['_Globals'].value.iOffset = new THREE.Vector2(0, 0);
        }

        this.uniforms['_Globals'].value.iOffset
            .copy(this.controls.offset)
            .divide(new THREE.Vector2(window.innerWidth, window.innerHeight));

        // this.uniforms['_Globals'].value.iOffset.x *= window.innerWidth / window.innerHeight;

        if (!(this.uniforms['_Globals'].value.iBufferResolution instanceof THREE.Vector2))
        {
            this.uniforms['_Globals'].value.iBufferResolution = new THREE.Vector2(this.buffer.width, this.buffer.height);
        }
        else
        {
            this.uniforms['_Globals'].value.iBufferResolution.set(this.buffer.width, this.buffer.height);
        }

        this.material.needsUpdate = true;
    }

}