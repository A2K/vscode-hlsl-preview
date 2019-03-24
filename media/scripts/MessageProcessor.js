

class MessageProcessor extends EventEmitter
{
    constructor()
    {
        super();

        this.handlers = [
            "compileShader",
            "dumpAST",
            "loadUniforms",
            "processSettings",
            "saveImage",
            "showErrorMessage",
            "updateShader",
            "forgetShader"
        ];
    }

    postMessage(type, data)
    {
        window.events.emit('postMessage', { type: type, data: data || {} });
    }

    setShaderReactor(reactor)
    {
        this.shaderReactor = reactor;
    }

    register(eventEmitter)
    {
        this.handlers.forEach(handler =>
        {
            eventEmitter.on(`message.${handler}`, event => this[handler](event, event.data));
        });
    }

    saveImage(event, data)
    {
        RenderToFile(data.width, data.height, data.mimeType)
        .then(dataUrl =>
        {
            this.postMessage('saveImage', {
                mimeType: data.mimeType,
                path: data.path,
                width: data.width,
                height: data.height,
                image: dataUrl
            });
        });
    }

    compileShader(event, data)
    {
        if (!window.wasm)
        {
            console.error("received request to compile a shader but don't have WASM enabled");
            return;
        }

        let handleResponse = (result) =>
        {
            this.postMessage('compileShader', {
                responseId: data.responseId,
                version: data.version,
                documentId: data.documentId,
                success: result.success,
                error: result.error,
                reflection: result.reflection,
                glsl: result.glsl,
                metadata: data.metadata
            });
        };

        window.wasm.compile(data.code, data).then(handleResponse, handleResponse);
    }

    dumpAST(event, data)
    {
        if (!window.wasm)
        {
            console.error("received request to compile a shader but don't have WASM enabled");
            return;
        }

        let handleResponse = (result) =>
        {
            console.log('dumpAST response:', typeof(result.data), new Uint8Array(result.data).toString('utf-8'));
            this.postMessage('dumpAST', {
                version: data.version,
                documentId: data.documentId,
                responseId: data.responseId,
                success: result.success,
                error: result.error,
                data: new TextDecoder("utf-8").decode(result.data)
            });
        };

        window.wasm.dumpAST(data.code, data).then(handleResponse, handleResponse);
    }

    updateShader(event, data)
    {
        let documentId = parseInt(data.documentId);

        let shader = this.shaderReactor.getOrCreateShader(documentId);

        if ('bufferName' in data)
        {
            shader.bufferName = data.bufferName;
        }

        if ('code' in data)
        {
            shader.setCode(data.code);
        }

        if ('uniforms' in data)
        {
            this.shaderReactor.updateUniformsTypes(documentId, data.uniforms);
        }

        if ('textures' in data)
        {
            this.shaderReactor.updateTextures(documentId, data.textures);
        }

        if ('ifdefs' in data)
        {
            this.shaderReactor.updateIfdefs(documentId, data.ifdefs);
        }

        if ('bufferSettings' in data)
        {
            this.shaderReactor.updateBufferSettings(documentId, data.bufferSettings);
        }

        if ('enabledIfdefs' in data)
        {
            this.shaderReactor.updateEnabledIfdefs(documentId, data.enabledIfdefs);
        }

        shader.fileBaseName = data.fileBaseName;
        shader.entryPointName = data.entryPointName;

        switch(data.type)
        {
            case 'pixel':
                this.shaderReactor.setFragmentShaderDocument(data.documentId, event);
            break;
            case 'vertex':
                this.shaderReactor.setVertexShaderDocument(data.documentId, event);
            break;
            case 'buffer':
                this.shaderReactor.addBufferDocument(data.documentId, event);
            break;
        }
    }

    loadUniforms(event, data)
    {
        this.shaderReactor.updateUniformsValues(data.documentId, data.uniforms);
    }

    showErrorMessage(event, data)
    {
        // if (data.message)
        // {
        //     console.error("RECEIVED SHADER ERROR: " + data.message);
        // }
        this.shaderReactor.setErrorMessage(data.documentId, data.message);
    }

    processSettings(event, data)
    {
        processSettings(event, data);
    }

    forgetShader(event, data)
    {
        this.shaderReactor.forgetShader(data.documentId);
    }

}
