
class BuffersRenderer extends EventEmitter
{
    constructor(shaderReactor)
    {
        super();
        this.shaderReactor = shaderReactor;

        this.lastBufferNumber = 0;
        this.buffers = [];

        this.setSize(window.innerWidth, window.innerHeight);

        $(window).resize((() =>
            this.setSize(window.innerWidth, window.innerHeight)
        ).bind(this));

        this.shaderReactor.on('update.buffer', ((event) => {
            this.updateBuffers();
        }).bind(this));

        this.lastUpdateTime = Date.now();
    }

    updateBuffers()
    {
        let shaders = this.shaderReactor.getBufferShaders();

        let bufferDocumentIds = shaders.map(shader => shader.documentId);

        let existingDocumentIds = this.buffers.map(buffer => buffer.shader.documentId);

        let added = shaders.filter(shader => existingDocumentIds.findIndex(id => id === shader.documentId) < 0);
        let removed = this.buffers.filter(buf => bufferDocumentIds.findIndex(id => id === buf.shader.documentId) < 0);

        removed.forEach(documentId =>
        {
            let index = this.buffers.findIndex(buf => buf.shader.documentId == documentId);
            buffers[index].off('update');
            this.buffers.splice(index, 1);
            this.lastUpdateTime = Date.now();
        });

        added.forEach(shader =>
        {
            let buffer = new ShaderBuffer(shader);
            this.buffers.push(buffer);
            this.lastUpdateTime = Date.now();

            buffer.on('update', ((event) => {
                this.emit('update.buffer', event.data, event);
            }));

            buffer.on('remove', ((event) =>
            {
                let documentId = event.data.buffer.shader.documentId;
                this.removeBufferByDocumentId(documentId);
                window.communicator.postMessage('removeBuffer', {
                    documentId: documentId
                });
            }).bind(this));
        });
    }

    forEach(f)
    {
        this.buffers.forEach((item, index, array) => f(item, index, array));
    }

    contains(name)
    {
        for(let i = 0; i < this.buffers.length; ++i)
        {
            if (this.buffers[i].name === name)
            {
                return true;
            }
        }

        return false;
    }

    get length()
    {
        return this.buffers.length;
    }

    addBuffer(bufferShader)
    {
        this.buffers.push(bufferShader);
        this.lastUpdateTime = Date.now();
    }

    removeBufferAtIndex(i)
    {
        this.lastUpdateTime = Date.now();
        return this.buffers.splice(i, 1);
    }

    removeBufferByDocumentId(documentId)
    {
        console.log('removeBufferByDocumentId', documentId);
        let index = this.buffers.findIndex(buffer => buffer.shader.documentId === documentId);
        if (index >= 0)
        {
            this.buffers.splice(index, 1).forEach(buffer => buffer.dispose());
            this.lastUpdateTime = Date.now();
        }
    }

    getBufferByDocumentId(documentId)
    {
        return this.buffers.find(buffer => buffer.shader.documentId === documentId);
    }

    bindBuffers(uniforms, toBuffer)
    {
        let updated = false;
        for(let i = 0; i < this.buffers.length; ++i)
        {
            let buffer = this.buffers[i];

            let name = buffer.name;
            let uniformName = `SPIRV_Cross_Combined${name}${name}Sampler`;

            if (buffer.renderTarget.texture)
            {
                if (uniformName in uniforms)
                {
                    if ('value' in uniforms[uniformName])
                    {
                        if (uniforms[uniformName].value !== buffer.renderTarget.texture)
                        {
                            console.log("RENDER TARGET UPDATED:", uniformName);
                            updated = true;
                        }
                    }
                }
                uniforms[uniformName] = {
                    type: 't',
                };

                uniforms[uniformName].value = buffer.renderTarget.texture;
            }
            else
            {
                console.error('buffer has no texture:', buffer.name);
            }
        }
        return updated;
    }

    doesBufferNeedRender(buffer)
    {
        if (buffer.realtime) return true;

        return (!buffer.isRendered()) ||
            (buffer.lastRenderTime < buffer.lastUpdateTime) ||
            (buffer.lastRenderTime < buffer.shader.lastUpdateTime) ||
            (buffer.lastRenderTime < buffer.shader.uniforms.lastUpdateTime) ||
            (buffer.lastRenderTime < buffer.shader.uniforms.getValuesLastUpdateTime()) ||
            (buffer.lastRenderTime < buffer.shader.ifdefs.lastUpdateTime);
    }

    render(renderer, virtualCamera)
    {
        let updated = false;
        let rendered = false;
        this.buffers.forEach(buffer =>
        {
            if (this.bindBuffers(buffer.uniforms, buffer))
            {
                buffer.material.needsUpdate = true;
            }
            if (rendered || buffer.material.needsUpdate || this.doesBufferNeedRender(buffer))
            {
                virtualCamera.updateUniforms(buffer.uniforms);

                updated = buffer.render(renderer) || updated;
                buffer.lastRenderTime = Date.now();

                rendered = true;
            }
        });

        return updated;
    }

    setSize(width, height)
    {
        this.buffers.forEach(buffer =>
        {
            if (buffer.matchRendererResolution)
            {
                buffer.width = width;
                buffer.height = height;
            }
        });
    }
}