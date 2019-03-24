class PreviewScene3D extends PreviewScene
{
    constructor(camera)
    {
        super();

        this.refCamera = camera;

        this.DefaultFragmentShader = document.getElementById('fragmentShader').textContent;
        this.DefaultVertexShader = document.getElementById('vertexShaderMesh').textContent;

        this.background = new THREE.CubeTextureLoader()
        .setPath(document.getElementById('skyboxPath').textContent)
        .load([
            'posx.jpg',
            'negx.jpg',
            'posy.jpg',
            'negy.jpg',
            'posz.jpg',
            'negz.jpg'
        ]);

        this.background.generateMipmaps = true;

        this.CurrentGeometrySize = 100;
        this.CurrentGeometrySubdivisions = 32;

        this.setGeometryClass('sphere');
    }

    setGeometryClass(geometryClass)
    {
        switch(geometryClass)
        {
            case 'cube':
                this.MakeGeometry = (size, subdivision) => new THREE.BoxGeometry(size, size, size, subdivision, subdivision, subdivision);
            break;
            case 'cylinder':
                this.MakeGeometry = (size, subdivision) => new THREE.CylinderGeometry(size * 0.5, size * 0.5, size, subdivision, subdivision);
            break;
            case 'cone':
                this.MakeGeometry = (size, subdivision) => new THREE.ConeGeometry(size * 0.5, size, subdivision, subdivision);
            break;
            case 'sphere':
            default:
                this.MakeGeometry = (size, subdivision) => new THREE.SphereGeometry(size * 0.5, subdivision, subdivision);
            break;
        }
        this.geometryClassName = geometryClass;
    }

    dispose()
    {
        if (this.background)
        {
            this.background.dispose();
            delete this.background;
        }

        super.dispose();
    }

    onBeforeRender(renderer)
    {
        super.onBeforeRender(renderer);
    }

    get geometry()
    {
        if (this._geometry)
        {
            if ((this._geometry._geometryClassName !== this.geometryClassName) ||
                (this._geometry._subdivision !== this.CurrentGeometrySubdivisions) ||
                (this._geometry._size !== this.CurrentGeometrySize))
            {
                this._geometry.dispose();
                delete this._geometry;
            }
            else
            {
                return this._geometry;
            }
        }

        this._geometry = this.MakeGeometry(this.CurrentGeometrySize, this.CurrentGeometrySubdivisions);
        this._geometry._size = this.CurrentGeometrySize;
        this._geometry._subdivision = this.CurrentGeometrySubdivisions;
        this._geometry._geometryClassName = this.geometryClassName;

        return this._geometry;
    }

    get camera()
    {
        let aspect = window.innerWidth / window.innerHeight;

        if (this._camera)
        {
            if (this._camera.aspect !== aspect)
            {
                this._camera.aspect = aspect;
            }

            this._camera.position.copy(this.refCamera.position);
            this._camera.rotation.copy(this.refCamera.rotation);

            this._camera.updateProjectionMatrix();

            return this._camera;
        }

        this._camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100000);

        this.add(this._camera);

        this._camera.position.copy(this.refCamera.position);
        this._camera.rotation.copy(this.refCamera.rotation);
        this._camera.updateProjectionMatrix();

        return this._camera;
    }
}