

class VirtualCamera
{

    constructor()
    {
        // this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 100000000);
        this.camera.position.set(-500, 0, 0);
        this.camera.lookAt(new THREE.Vector3(0, 0, 0));
        this.enabled = true;
        // this.scene.add(this.camera);
    }

    updateUniforms(uniforms)
    {
        if (this.enabled)
        {
            this.controls.update();
        }

        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateMatrix();
        this.camera.updateProjectionMatrix();
        this.camera.updateMatrixWorld();

        let Globals = uniforms['_Globals'] || (uniforms['_Globals'] = {});
        let GlobalsValue = Globals['value'] || (Globals['value'] = {});

        GlobalsValue.iVirtualProjectionMatrix = this.camera.projectionMatrix;
        GlobalsValue.iVirtualProjectionInverseMatrix = new THREE.Matrix4().getInverse(this.camera.projectionMatrix);
        GlobalsValue.iVirtualModelViewMatrix = this.camera.modelViewMatrix;
        GlobalsValue.iVirtualWorldMatrix = this.camera.matrixWorld;
        GlobalsValue.iVirtualWorldInverseMatrix = this.camera.matrixWorldInverse;
    }

    enable()
    {
        this.enabled = true;
    }

    disable()
    {
        this.enabled = false;
        if (this._controls)
        {
            this._controls.dispose();
            delete this._controls;
        }
    }

    get controls()
    {
        if (this._controls)
        {
            return this._controls;
        }

        let controls = new THREE.OrbitControls(this.camera, window.renderer.renderer.domElement);

        //controls.addEventListener( 'change', render ); // call this only in static scenes (i.e., if there is no animation loop)

        controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
        controls.dampingFactor = 0.25;

        controls.rotateSpeed = 0.5;

        controls.enablePan = true;
        controls.screenSpacePanning = true;

        // TODO: expose min/max distances in UI
        controls.minDistance = 0;
        controls.maxDistance = 1000;

        //controls.maxPolarAngle = Math.PI / 2;
        controls.target = new THREE.Vector3(0, 0, 0);

        this._controls = controls;

        return controls;
    }

}