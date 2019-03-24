'strict';

class Ifdef extends EventEmitter
{
    constructor(parent, name, enabled)
    {
        super();

        this.parent = parent;
        this.name = name || "";
        this._enabled = enabled || false;

        this.lastUpdateTime = Date.now();

        this.declareEvent('update');
        this.declareEvent('delete');
    }

    get enabled()
    {
        return this._enabled;
    }

    set enabled(value)
    {
        if (this._enabled !== value)
        {
            this._enabled = value;
            this.lastUpdateTime = Date.now();
            this.emit('update');
        }
    }
}

class ShaderIfdefs extends EventEmitter
{
    constructor(ifdefs)
    {
        super();

        this.ifdefs = [];
        this.setIfdefs(ifdefs || []);
        this.lastUpdateTime = 0;
        this.declareEvent('update');
    }

    _makeIfdef(name, value)
    {
        let ifdef = new Ifdef(this, name, value || false);
        ifdef.on('update', ((event) => {
            this.lastUpdateTime = Date.now();
            this.emit('update', event);
        }).bind(this));
        return ifdef;
    }

    getIfdefByName(name)
    {
        return this.ifdefs.find(item => item.name === name);
    }

    setIfdefs(ifdefs)
    {
        let deleted = this.ifdefs
            .filter(ifdef => ifdefs.indexOf(ifdef.name) < 0);

        let added = ifdefs
            .filter(ifdef => typeof(this.getIfdefByName(ifdef)) === 'undefined')
            // .filter(ifdef => this.ifdefs.indexOf(ifdef) < 0)
            .map(ifdef => this._makeIfdef(ifdef));

        if (deleted.length)
        {
            this.ifdefs = this.ifdefs
                .filter(ifdef => ifdefs.indexOf(ifdef.name) >= 0);

            deleted.forEach(ifdef => {
                ifdef.emit('delete');
            });
        }

        if (added.length)
        {
            this.ifdefs = this.ifdefs.concat(added);
        }

        if (deleted.length > 0 || added.length > 0)
        {
            this.lastUpdateTime = Date.now();
            this.emit('update');
        }
    }

    isIfdefEnabled(name)
    {
        let ifdef = this.ifdefs.find((item) => item.name === name);
        return ifdef && ifdef.enabled;
    }

    setEnabledIfdefs(enabledIfdefs)
    {
        this.ifdefs.forEach(ifdef => {
            ifdef.enabled = enabledIfdefs.indexOf(ifdef.name) >= 0;
        });

        let newIfdefs = enabledIfdefs
            .filter(ifdef => typeof(this.getIfdefByName(ifdef)) === 'undefined')
            .map(ifdef => this._makeIfdef(ifdef, true));

        if (newIfdefs.length)
        {
            this.ifdefs = this.ifdefs.concat();

            this.lastUpdateTime = Date.now();
            this.emit('update');
        }
    }

    getIfdefsNames()
    {
        return this.ifdefs
                .map(ifdef => ifdef.name);
    }

    getEnabledIfdefNames()
    {
        return this.ifdefs
                .filter(ifdef => ifdef.enabled)
                .map(ifdef => ifdef.name);
    }
}

class BufferSettings
{
    constructor()
    {
        this.realtime = true;
        this.matchRendererResolution = true;
        this.width = window.renderer.width;
        this.height = window.renderer.height;
        this.type = THREE.UnsignedByteType;
        this.format = THREE.RGBAFormat;
    }
};

class Shader extends EventEmitter
{
    constructor(documentId)
    {
        super();

        this.bufferSettings = new BufferSettings();

        this.documentId = documentId || 0;

        this._bufferName = `Buffer${documentId}`;

        this.code = '';

        this.uniforms = new ShaderUniforms();
        this.uniforms.on('loaded.texture', ((event) => {
            this.lastUpdateTime = Date.now();
            this.loadedTexture = true;
            this.emit('update', {}, event);
        }).bind(this));

        this.ifdefs = new ShaderIfdefs();

        this.lastUpdateTime = 0;

        let data = { documentId: this.documentId };
        this.uniforms.on('update', (event) => {
            this.lastUpdateTime = Date.now();
            this.emit('update.uniforms', data, event);
        });
        this.ifdefs.on('update', (event) => {
            this.lastUpdateTime = Date.now();
            this.emit('update.ifdefs', data, event);
        });

        window.events.emit('postMessage', {
            type: 'getUniforms',
            data: {
                documentId: documentId
            }
        });
    }

    dispose()
    {
        this.emit('remove', { shader: this });
        super.dispose();
    }

    set bufferName(value)
    {
        if (this._bufferName !== value)
        {
            this._bufferName = value;
            this.lastUpdateTime = Date.now();
            this.emit('update.name', { shader: this });
        }
    }

    get bufferName()
    {
        return this._bufferName;
    }

    set errorMessage(message)
    {
        if (this._errorMessage !== message)
        {
            this._errorMessage = message;
            this.lastUpdateTime = Date.now();
            this.emit('update.error', { shader: this });
        }
    }

    get errorMessage()
    {
        return this._errorMessage;
    }

    setCode(code)
    {
        if (this.code !== code)
        {
            this.code = code;
            this.lastUpdateTime = Date.now();
            this.emit('update.code', { documentId: this.documentId });
        }
    }

};
