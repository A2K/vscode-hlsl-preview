'strict';

class PreviewScene extends THREE.Scene
{
    constructor()
    {
        super();

        this._geometry = null;
        this._material = null;
        this._mesh = null;
        this._camera = null;

        this.DefaultFragmentShader = document.getElementById('fragmentShader').textContent;
        this.DefaultVertexShader = document.getElementById('vertexShader').textContent;

        this.uniforms = {
            '_Globals': {
                value: {
                }
            }
        };
    }

    dispose()
    {
        if (this._geometry)
        {
            this._geometry.dispose();
            delete this._geometry;
        }

        if (this._material)
        {
            this._material.dispose();
            delete this._material;
        }

        if (this._mesh)
        {
            this.remove(this._mesh);
            delete this._mesh;
        }

        if (this._camera)
        {
            this.remove(this._camera);
            delete this._camera;
        }
    }

    onAfterRender(renderer)
    {
    }

    get geometry()
    {
        return this._geometry || (this._geometry = new THREE.PlaneGeometry(2, 2));
    }

    updateMaterial()
    {
        if (this._material)
        {
            if((this._fragmentShader &&
                (this._fragmentShader.lastUpdateTime > this._material.lastUpdateTime)) ||
                (this._vertexShader &&
                (this._vertexShader.lastUpdateTime > this._material.lastUpdateTime)))
            {
                this._material.fragmentShader = this._fragmentShader.code || this.DefaultFragmentShader;
                this._material.needsUpdate = true;
                this._material.lastUpdateTime = Date.now();
            }
        }
    }

    get fragmentShader()
    {
        return this._fragmentShader;
    }

    set fragmentShader(shader)
    {
        if (this._fragmentShader !== shader)
        {
            this._fragmentShader = shader;

            if (this._material)
            {
                this._material.fragmentShader = this._fragmentShader.code || this.DefaultFragmentShader;
                this._material.needsUpdate = true;
                this._material.lastUpdateTime = Date.now();
            }
        }
    }

    get vertexShader()
    {
        return this._vertexShader;
    }

    set vertexShader(shader)
    {
        if (this._vertexShader !== shader)
        {
            this._vertexShader = shader;

            if (this._material)
            {
                this._material.vertexShader = this._vertexShader.code || this.DefaultVertexShader;
                this._material.needsUpdate = true;
                this._material.lastUpdateTime = Date.now();
            }
        }
    }

    get material()
    {
        if (this._material)
        {
            return this._material;
        }

        let options = {
            vertexShader: this._vertexShader ? this._vertexShader.code : this.DefaultVertexShader,
            fragmentShader: this._fragmentShader ? this._fragmentShader.code : this.DefaultFragmentShader,
            uniforms: this.uniforms
        };

        this._material = new THREE.ShaderMaterial(options);
        this._material.lastUpdateTime = Date.now();

        // console.log('Created new material for shader', this._fragmentShader ? this._fragmentShader.documentId : '<null>');

        return this._material;
    }

    get mesh()
    {
        if (this._mesh)
        {
            if (this._mesh.geometry === this._geometry &&
                this._mesh.material === this._material)
            {
                return this._mesh;
            }
            else
            {
                this.remove(this._mesh);
                this._mesh.dispose();
            }
        }

        this._mesh = new THREE.Mesh(this.geometry, this.material);

        this.add(this._mesh);

        return this._mesh;
    }

    get camera()
    {
        if (this._camera) return this._camera;

        this._camera = new THREE.Camera();
        this._camera.position.set(-1, 0, 0);

        this.add(this._camera);

        return this._camera;
    }

    onBeforeRender(renderer)
    {
        if (!this.geometry || !this.material || !this.mesh || !this.camera)
        {
            console.error('Invalid PreviewScene state!');
        }

        // try
        // {
        //     renderer.compile(this, this.camera);
        // }
        // catch(e)
        // {
        //     // TODO!!!!: report error (there is no way to get message)
        // }
    }

}