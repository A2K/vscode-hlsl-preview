
class ShaderReactor extends EventEmitter
{
    constructor()
    {
        super();

        this.shaders = {};
        this.fragmentShaderId = undefined;
        this.vertexShaderId = undefined;
        this.bufferShaderIds = new Set();
        this.lastUpdateTime = Date.now();

        this.declareEvent('update.fragment');
        this.declareEvent('update.vertex');
        this.declareEvent('update.ifdefs');
        this.declareEvent('update.buffer');
    }

    setFragmentShaderDocument(documentId, event)
    {
        if (this.fragmentShaderId === documentId) return;

        let oldId = this.fragmentShaderId;

        this.lastUpdateTime = Date.now();

        this.fragmentShaderId = documentId;

        if (oldId)
        {
            if (oldId in this.shaders)
            {
                this.forgetShader(oldId);
            }
        }

        this.emit('update.fragment', {
            documentId: documentId
        }, event);
    }

    setVertexShaderDocument(documentId, event)
    {
        if (this.vertexShaderId === documentId) return;

        if (this.fragmentShaderId)
        {
            if (this.fragmentShaderId in this.shaders)
            {
                this.forgetShader(this.fragmentShaderId);
            }
        }

        this.lastUpdateTime = Date.now();

        if (this.bufferShaderIds.has(documentId))
        {
            this.bufferShaderIds.delete(documentId);
            this.emit('update.buffer', {
                documentId: documentId
            }, event);
        }

        this.vertexShaderId = documentId;

        this.emit('update.vertex', {
            documentId: documentId
        }, event);
    }

    addBufferDocument(documentId, event)
    {
        if (this.bufferShaderIds.has(documentId)) return;

        this.bufferShaderIds.add(documentId);

        this.lastUpdateTime = Date.now();

        this.emit('update.buffer', {
            documentId: documentId
        }, event);
    }

    getBufferShaders()
    {
        return Array.from(this.bufferShaderIds)
            .filter(documentId => documentId in this.shaders)
            .map(documentId => this.getShader(documentId));
    }

    getFragmentShader()
    {
        if (typeof(this.fragmentShaderId) !== 'undefined')
        {
            return this.getOrCreateShader(this.fragmentShaderId);
        }
    }

    getVertexShader()
    {
        if (typeof(this.vertexShaderId) !== 'undefined')
        {
            return this.getOrCreateShader(this.vertexShaderId);
        }
    }

    createShader(documentId)
    {
        let shader = new Shader(documentId);

        this.shaders[documentId] = shader;

        this.lastUpdateTime = Date.now();

        shader.on('update', ((shader, event) =>
        {
            if (this.fragmentShaderId === shader.documentId)
            {
                this.emit('update.fragment', {
                    documentId: shader.documentId,
                    shader: shader
                }, event);
            }
            else if (this.vertexShaderId === shader.documentId)
            {
                this.emit('update.vertex', {
                    documentId: shader.documentId,
                    shader: shader
                }, event);
            }
            else
            {
                this.emit('update.buffer', {
                    documentId: shader.documentId,
                    shader: shader
                }, event);
            }
        }).bind(this, shader));

        shader.on('remove', ((event) =>
        {
            let documentId = event.data.shader.documentId;

            if (documentId in this.shaders)
            {
                delete this.shaders[documentId];
            }

            this.lastUpdateTime = Date.now();

        }).bind(this));

        return shader;
    }

    getShader(documentId)
    {
        return this.shaders[documentId];
    }

    getOrCreateShader(documentId)
    {
        if (documentId in this.shaders)
        {
            return this.shaders[documentId];
        }

        return this.createShader(documentId);
    }

    updateUniformsTypes(documentId, uniformsTypes)
    {
        let shader = this.getOrCreateShader(documentId);

        let uniforms = shader.uniforms;

        let globals = uniformsTypes['_Globals'] || {};

        Object.keys(globals).forEach(name =>
        {
            if (InternalParameters.has(name)) return;

            let type = globals[name].type;
            let uniform = uniforms.getGlobalUniform(name);
            if (uniform)
            {
                uniform.type = type;
            }
            else
            {
                uniform = Uniform.create(name, type);
                uniforms.addUniform(uniform);
            }
        });

        uniforms.getGlobalUniforms().forEach(uniform =>
        {
            if (!(uniform.name in globals))
            {
                uniforms.removeGlobalUniform(uniform.name);
            }
        });
    }

    getSerializedUniforms(documentId)
    {
        let result = {
        };

        let shader = this.getOrCreateShader(documentId);

        let uniforms = shader.uniforms;

        uniforms.getGlobalUniforms().forEach(uniform =>
        {
            if (InternalParameters.has(uniform.name)) return;
            if (!('_Globals' in result)) result['_Globals'] = {};
            result['_Globals'][uniform.name] = { type: uniform.type, value: uniform.value };
        });

        uniforms.getTextureUniforms().forEach(texture =>
        {
            result[texture.name] = {
                type: texture.textureType,
                value: texture.value,
                settings: texture.settings
            };
        });

        return result;
    }

    updateUniformsValues(documentId, values)
    {
        let shader = this.getOrCreateShader(documentId);

        Object.keys(values).forEach(name => {
            if (name === '_Globals') return;
            let value = values[name];
            if (shader.uniforms.getTextureUniform(name))
            {
                shader.uniforms.setTextureUniformValue(name, value.value, value.settings);
            }
        });

        if ('_Globals' in values)
        {
            values = values['_Globals'];

            Object.keys(values).forEach(name => {
                if (InternalParameters.has(name)) return;
                let value = values[name];
                if (typeof(value.value) !== 'undefined') {
                    value = value.value;
                }
                if (typeof(value.value) !== 'undefined') {
                    value = value.value;
                }
                shader.uniforms.setGlobalUniformValue(name, value);
            });
        }
    }

    updateBufferSettings(documentId, values)
    {
        MergeObjects(this.getOrCreateShader(documentId).bufferSettings, values);
    }

    updateIfdefs(documentId, ifdefs)
    {
        this.getOrCreateShader(documentId).ifdefs.setIfdefs(ifdefs);
    }

    updateEnabledIfdefs(documentId, enabledIfdefs)
    {
        this.getOrCreateShader(documentId).ifdefs.setEnabledIfdefs(enabledIfdefs);
    }

    updateTextures(documentId, textures)
    {
        let shader = this.getOrCreateShader(documentId);

        let uniforms = shader.uniforms;

        let uniformNames = new Set(Object.keys(textures));

        uniforms.getTextureUniforms()
        .filter(u => !uniformNames.has(u.name))
        .forEach(tex => uniforms.removeTextureUniform(tex.name));

        Object.keys(textures).forEach(name =>
        {
            let uniform = uniforms.getTextureUniform(name);
            if (uniform)
            {
                if (uniform.textureType !== textures[name])
                {
                    uniforms.removeTextureUniform(name);
                    uniform = new TextureUniform(name, textures[name]);
                    uniforms.addUniform(uniform);
                }
            }
            else
            {
                uniform = new TextureUniform(name, textures[name]);
                uniforms.addUniform(uniform);
            }
        });
    }

    setErrorMessage(documentId, message)
    {
        let shader = this.getOrCreateShader(documentId);

        shader.errorMessage = message;
    }

    forgetShader(documentId)
    {
        if (documentId in this.shaders)
        {
            this.lastUpdateTime = Date.now();

            this.shaders[documentId].dispose();
            delete this.shaders[documentId];
            if (documentId === this.fragmentShaderId)
            {
                this.fragmentShaderId = undefined;
                this.emit('update.fragment', {
                    documentId: this.fragmentShaderId,
                    shader: this.getFragmentShader()
                }, event);
            }
            else if (documentId == this.vertexShaderId)
            {
                this.vertexShaderId = undefined;
                this.emit('update.vertex', {
                    documentId: this.vertexShaderId,
                    shader: this.getVertexShader()
                }, event);
            }
            else
            {
                if (this.bufferShaderIds.has(documentId))
                {
                    this.bufferShaderIds.delete(documentId);
                    this.emit('update.buffer', {
                        documentId: documentId
                    }, event);
                }
            }
        }
    }

}
