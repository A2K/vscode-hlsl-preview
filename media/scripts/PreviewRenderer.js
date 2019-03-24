
class PreviewRenderer
{
    constructor(container, shaderReactor, options)
    {
        this.renderer = new THREE.WebGLRenderer(options || {
            antialias: true,
            depth: true,
            precision: "highp"
        });

        container[0].appendChild(this.renderer.domElement);

        $(this.renderer.domElement).addClass('PreviewRenderer');

        this.shaderReactor = shaderReactor;

        this.virtualCamera = new VirtualCamera();

        this.shaderReactor.on('update.*.loaded.texture', (() =>
        {
            if (this._material)
            {
                this._material.needsUpdate = true;
            }
        }).bind(this));

        this.scene = new PreviewScene2D();

        this.shaderReactor.on('update.fragment', ((event) =>
        {
            if ((!this.scene.fragmentShader) ||
                (this.scene.fragmentShader.documentId !== this.shaderReactor.getFragmentShader().documentId))
            {
                this.previewBuffer = null;
            }
            this.scene.fragmentShader = this.shaderReactor.getFragmentShader();
            this.scene.updateMaterial();
        }).bind(this));

        this.shaderReactor.on('update.vertex', ((event) =>
        {
            this.scene.vertexShader = this.shaderReactor.getVertexShader();
        }).bind(this));

        this.buffers = new BuffersRenderer(this.shaderReactor);

        this.buffers.on('update', (event) => {
            window.communicator.postMessage('updateBufferSettings', {
                documentId: event.data.buffer.shader.documentId,
                bufferSettings: event.data.bufferSettings
            });
        });

        this.startTime = Date.now();
        this.shaderTime = 0;

        this.updateSize();

        $(window).resize(this.updateSize.bind(this));

        window.events.on('setShaderMode', ((event) => // TODO: test this
        {
            let oldScene = this.scene;

            switch(event.data.mode)
            {
                case '2d':
                    this.scene = new PreviewScene2D();
                break;
                case 'sphere':
                case 'cube':
                case 'cylinder':
                case 'cone':
                    this.scene = new PreviewScene3D(this.virtualCamera.camera);
                    this.scene.setGeometryClass(event.data.mode);
                break;
            }

            this.scene.fragmentShader = this.shaderReactor.getFragmentShader();

            oldScene.dispose();

            window.communicator.postMessage('updateSettings', {
                shaderMode: event.data.mode
            });
        }).bind(this));
    }

    setPreviewBuffer(buffer)
    {
        this.previewBuffer = buffer;
    }

    updateSize()
    {
        this.setSize(window.innerWidth, window.innerHeight);
    }

    setSize(width, height)
    {
        this.width = width;
        this.height = height;

        this.renderer.setSize(width, height);
    }

    updateTime()
    {
        const elapsedMilliseconds = Date.now() - this.startTime;
        const elapsedSeconds = elapsedMilliseconds / 1000.;
        return (this.shaderTime = 60. * elapsedSeconds);
    }

    render()
    {
        this.updateTime();

        if (this.buffers.length)
        {
            // let cameraUniforms = {};
            // this.virtualCamera.updateUniforms(cameraUniforms);
            if (this.buffers.render(this.renderer, this.virtualCamera))
            {
                this.scene.material.needsUpdate = true;
            }
        }

        if (this.previewBuffer)
        {
            if (this.virtualCamera)
            {
                this.virtualCamera.disable();
            }

            if (this.bufferPreviewScene)
            {
                this.bufferPreviewScene.buffer = this.previewBuffer;
            }
            else
            {
                this.bufferPreviewScene = new BufferPreviewScene2D(this.previewBuffer);
            }

            this.bufferPreviewScene.onBeforeRender(this.renderer);

            this.updateUniforms(this.bufferPreviewScene.uniforms);
            this.virtualCamera.updateUniforms(this.bufferPreviewScene.uniforms);

            this.renderer.render(this.bufferPreviewScene, this.bufferPreviewScene.camera);

            this.bufferPreviewScene.onAfterRender(this.renderer);

            return;
        }
        else
        {
            if (this.bufferPreviewScene)
            {
                this.bufferPreviewScene.dispose();
                delete this.bufferPreviewScene;

                if (this.virtualCamera)
                {
                    this.virtualCamera.enable();
                }
            }
        }

        this.scene.onBeforeRender(this.renderer);

        this.updateUniforms(this.scene.uniforms);

        if (this.virtualCamera.enabled)
        {
            this.virtualCamera.updateUniforms(this.scene.uniforms);
        }

        if (this.buffers.length)
        {
            if (this.buffers.bindBuffers(this.scene.uniforms))
            {
                this.scene.material.needsUpdate = true;
            }
        }

        this.renderer.render(this.scene, this.scene.camera);

        this.scene.onAfterRender(this.renderer);
    }

    updateUniforms(uniforms)
    {
        uniforms = uniforms || {};

        // TODO!: check shader update time
        let fragmentShader = this.shaderReactor.getFragmentShader();
        let vertexShader = this.shaderReactor.getVertexShader();

        let fields = new Set();

        if (vertexShader)
        {
            vertexShader.uniforms.getMaterialUniforms(uniforms, fields);
        }

        if (fragmentShader)
        {
            fragmentShader.uniforms.getMaterialUniforms(uniforms, fields);
        }

        // TODO!!!: console.log('fields:', JSON.stringify(fields));

        // GetKeysRecursive(uniforms, 3)
        // .forEach(keyPath => {
        //     if (!fields.has(keyPath))
        //     {
        //         // TODO!!!!: console.log("!!! UNIFORM NEEDS TO BE REMOVED:", keyPath);
        //     }
        // });

        uniforms['_Globals'] = uniforms['_Globals'] || {};
        uniforms['_Globals'].value = uniforms['_Globals'].value || {};

        let value = uniforms['_Globals'].value;

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
                        get: () => window.innerWidth
                    });
                    delete vector.y;
                    Object.defineProperty(vector, 'y', {
                        enumerable: true,
                        get: () => window.innerHeight
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

        return uniforms;
    }

}