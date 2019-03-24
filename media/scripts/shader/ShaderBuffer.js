'strict';

class ShaderBuffer extends EventEmitter
{
    constructor(shader)
    {
        super();

        this.shader = shader;

        this.createProperties();

        this.shader.on('update', (() => {
            this.lastUpdateTime = Date.now();
            this.scene.updateMaterial();
        }).bind(this));

        this.shader.on('remove', (event) => {
            this.emit('remove', { buffer: this, shader: this.shader }, event);
        });

        this.lastUpdateTime = Date.now();

        this.scene = new PreviewScene();

        this.scene.DefaultVertexShader = document.getElementById('vertexShaderInvY').textContent;

        this.scene.fragmentShader = this.shader;

        this.linearFilter = true;
    }

    get material()
    {
        return this.scene.material;
    }

    createProperties()
    {
        const Defaults = {
            realtime: true,
            matchRendererResolution: true,
            width: window.innerWidth,
            height: window.innerHeight,
            type: THREE.UnsignedByteType,
            format: THREE.RGBAFormat
        };

        Object.keys(Defaults).forEach((key =>
        {
            Object.defineProperty(this, key, {
                enumerable: true,
                get: ((Defaults) => {
                    return (key in this.bufferSettings) ? this.bufferSettings[key] : Defaults[key];
                }).bind(this, Defaults),
                set: ((value) => {
                    if (this.bufferSettings[key] !== value)
                    {
                        this.bufferSettings[key] = value;
                        this.lastUpdateTime = Date.now();
                        this.emit('update.settings', {
                            documentId: this.shader.documentId,
                            buffer: this,
                            bufferSettings: this.shader.bufferSettings
                         });
                    }
                }).bind(this)
            });
        }).bind(this));
    }

    get bufferSettings()
    {
        return this.shader.bufferSettings;
    }

    get name()
    {
        return this.shader.bufferName;
    }

    set name(value)
    {
        this.shader.bufferName = value;
        this.lastUpdateTime = Date.now();
    }

    get renderTarget()
    {
        if (this._renderTarget)
        {
            if (this._renderTarget.width === this.width &&
                this._renderTarget.height === this.height &&
                this._renderTarget._format === this.format &&
                this._renderTarget._type === this.type)
            {
                if ((this.linearFilter && this._renderTarget.texture.magFilter !== THREE.LinearFilter) ||
                    ((!this.linearFilter) && this._renderTarget.texture.magFilter !== THREE.NearestFilter))
                {
                    // this does not work, the render target needs to be recreated
                    // this._renderTarget.texture.magFilter = this.linearFilter ? THREE.LinearFilter : THREE.NearestFilter;
                    // this._renderTarget.texture.needsUpdate = true;
                }
                else
                {
                    return this._renderTarget;
                }
            }

            this._renderTarget.dispose();
            delete this._renderTarget;
        }

        this._renderTarget = new THREE.WebGLRenderTarget(this.width, this.height, {
            format: this.format,
            type: this.type,
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping,
            magFilter: this.linearFilter ? THREE.LinearFilter : THREE.NearestFilter,
            minFilter: THREE.LinearFilter,
            anisotropy: 0,
            encoding: THREE.LinearEncoding,
            depthBuffer: false,
            stencilBuffer: false
        });

        this._renderTarget._format = this.format;
        this._renderTarget._type = this.type;

        this._renderTarget.flipY = false;

        return this._renderTarget;
    }

    addDefaultUniforms(uniforms)
    {
        let globals = (uniforms['_Globals'] || (uniforms['_Globals'] = {}));
        let value = globals['value'] || (globals['value'] = {});

        if (!('iTime' in value))
        {
            Object.defineProperty(value, 'iTime', {
                enumerable: true,
                get: () => window.renderer.shaderTime
            });
        }

        if (!('iResolution' in value))
        {
            Object.defineProperty(value, 'iResolution', {
                enumerable: true,
                get: () => {
                    let vector = new THREE.Vector2(window.innerWidth, window.innerHeight);
                    delete vector.x;
                    Object.defineProperty(vector, 'x', {
                        enumerable: true,
                        get: () => this.width
                    });
                    delete vector.y;
                    Object.defineProperty(vector, 'y', {
                        enumerable: true,
                        get: () => this.height
                    });
                    return vector;
                }
            });
        }

        if (!('iMouse' in value))
        {
            Object.defineProperty(value, 'iMouse', {
                enumerable: true,
                get: () => {
                    let vector = new THREE.Vector4(window.mouse.x, window.mouse.y, window.mouse.durationLeftDown, window.mouse.durationRightDown);
                    delete vector.x;
                    delete vector.y;
                    delete vector.z;
                    delete vector.w;
                    Object.defineProperty(vector, 'x', {
                        enumerable: true,
                        get: () => window.mouse.x
                    });
                    Object.defineProperty(vector, 'y', {
                        enumerable: true,
                        get: () => window.mouse.y
                    });
                    Object.defineProperty(vector, 'z', {
                        enumerable: true,
                        get: () => window.mouse.durationLeftDown
                    });
                    Object.defineProperty(vector, 'w', {
                        enumerable: true,
                        get: () => window.mouse.durationRightDown
                    });
                    return vector;
                }
            });
        }
    }

    get uniforms()
    {
        return this.scene.uniforms;

        // this.uniforms = this.uniforms || {};

        // this.shader.uniforms.getMaterialUniforms(this.uniforms);

        // this.addDefaultUniforms(this.uniforms);

        // return this.uniforms;
    }

    render(renderer)
    {
        if (this.matchRendererResolution)
        {
            let size = renderer.getSize();
            this.width = size.width;
            this.height = size.height;
        }


        this.shader.uniforms.getMaterialUniforms(this.uniforms);
        this.addDefaultUniforms(this.uniforms);


        this.scene.fragmentShader = this.shader;
        renderer.render(this.scene, this.scene.camera, this.renderTarget, true);

        if (!this.renderTarget._rendered)
        {
            this.renderTarget._rendered = true;
            return true;
        }

        return false;
    }

    isRendered()
    {
        return this._renderTarget ? this._renderTarget._rendered : false;
    }

    dispose()
    {
        super.dispose();

        if (this._renderTarget)
        {
            this._renderTarget.dispose();
            this._renderTarget = null;
        }
    }
}

