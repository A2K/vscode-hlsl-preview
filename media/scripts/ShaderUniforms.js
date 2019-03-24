
class Uniform extends EventEmitter
{
    constructor(name, type, value)
    {
        super();

        this.name = name;
        this.__type = type;
        this.__value = this.convertValue(value);
        this.lastUpdateTime = Date.now();

        this.declareEvent('update');
    }

    getUniqueIdentifier()
    {
        return this.constructor.name + '__' + this.name;
    }

    set type(t)
    {
        if (t !== this.__type)
        {
            this.__type = t;
            this.lastUpdateTime = Date.now();
        }
    }

    get type()
    {
        return this.__type;
    }

    set value(v)
    {
        v = this.convertValue(v);
        if (this.__value !== v)
        {
            this.__value = v;
            this.lastUpdateTime = Date.now();
        }
    }

    get value()
    {
        return this.__value;
    }

    setValue(value)
    {
        value = this.convertValue(value);
        if (this.__value !== value)
        {
            this.__value = value;
            this.lastUpdateTime = Date.now();
            this.emit('update', {
                uniform: this
            });
        }
    }

    convertValue(v)
    {
        if (v instanceof Array)
        {
            if (v.length === 1)
                v = v[0];
            if (v.length === 2)
                v = new THREE.Vector2(v[0], v[1]);
            else if (v.length === 3)
                v = new THREE.Vector3(v[0], v[1], v[2]);
            else if (v.length === 4)
                v = new THREE.Vector4(v[0], v[1], v[2], v[3]);
        }
        return v;
    }


    setValueNoUpdate(v)
    {
        v = this.convertValue(v);
        if (this.__value !== v)
        {
            this.__value = v;
            this.lastUpdateTime = Date.now();
        }
    }

    getValue()
    {
        return this.value;
    }

    getUniform()
    {
        return { type: this.type, value: this.value };
    }

    static create(name, type)
    {
        switch(type)
        {
            case 't':
                return new TextureUniform(name, type);
            case 'float':
                return new GlobalUniformFloat(name);
            case 'vec2':
                return new GlobalUniformVec2(name);
            case 'vec3':
                return new GlobalUniformVec3(name);
            case 'vec4':
                return new GlobalUniformVec4(name);
        }

        console.error(`unexpected uniform type: ${type}`);
    }

}

class GlobalUniform extends Uniform
{
    constructor(name, type, value)
    {
        super(name, type, value);
    }

}

class GlobalUniformFloat extends GlobalUniform
{
    constructor(name, value)
    {
        super(name, 'float', parseFloat(value) || 0.0);
    }
}

class GlobalUniformVec2 extends GlobalUniform
{
    constructor(name, value)
    {
        super(name, 'vec2', value || new THREE.Vector2(0, 0));
    }
}

class GlobalUniformVec3 extends GlobalUniform
{
    constructor(name, value)
    {
        super(name, 'vec3', value || new THREE.Vector3(0, 0, 0));
    }
}

class GlobalUniformVec4 extends GlobalUniform
{
    constructor(name, value)
    {
        super(name, 'vec4', value || new THREE.Vector4(0, 0, 0, 0));
    }
}

class TextureUniform extends Uniform
{
    constructor(name, textureType, filename, settings)
    {
        super(name, 't', filename);
        this.textureType = textureType;
        this.settings = settings || DefaultTextureSettings;
    }
}

class ShaderUniforms extends EventEmitter
{
    constructor()
    {
        super();

        this.uniforms = {
            global: {},
            textures: {}
        };

        this.lastUpdateTime = Date.now();
    }

    // set lastUpdateTime(value)
    // {
    //     this._objectLastUpdateTime = value;
    // }

    getValuesLastUpdateTime()
    {
        return this.getUniforms()
            .map(u => u.lastUpdateTime)
            .reduce((p, n) => Math.max(p, n));
    }

    getGlobalUniforms()
    {
        return Object.keys(this.uniforms.global)
            .map(key => this.uniforms.global[key]);
    }

    getTextureUniforms()
    {
        return Object.keys(this.uniforms.textures)
            .map(key => this.uniforms.textures[key]);
    }

    getUniforms()
    {
        return this.getGlobalUniforms().concat(this.getTextureUniforms());
    }

    addUniform(uniform)
    {
        if (uniform instanceof GlobalUniform)
        {
            this.uniforms.global[uniform.name] = uniform;
        }
        else if (uniform instanceof TextureUniform)
        {
            this.uniforms.textures[uniform.name] = uniform;
        }
        else
        {
            console.error('unexpected uniform type:', uniform);
        }

        this.lastUpdateTime = Date.now();

        uniform.on('update', ((uniform, event) => {
            this.emit('update.uniforms', { uniform: uniform }, event);
        }).bind(this, uniform));
    }

    removeGlobalUniform(name)
    {
        if (name in this.uniforms.global)
        {
            delete this.uniforms.global[name];

            this.lastUpdateTime = Date.now();
        }
        else
        {
            console.warn('ShaderUniforms: can not remove uniform which does not exist: ' + name);
        }
    }

    removeTextureUniform(name)
    {
        if (name in this.uniforms.textures)
        {
            delete this.uniforms.textures[name];

            this.lastUpdateTime = Date.now();
        }
    }

    getGlobalUniform(name)
    {
        return this.uniforms.global[name];
    }

    getTextureUniform(name)
    {
        return this.uniforms.textures[name];
    }

    setGlobalUniformValue(name, value)
    {
        let uniform = this.uniforms.global[name];
        if (uniform)
        {
            uniform.setValueNoUpdate(value);
        }
        else
        {
            console.warn('unknown global uniform: ' + JSON.stringify(name));
        }
    }

    setTextureUniformValue(name, value, settings)
    {
        let uniform = this.uniforms.textures[name];
        if (uniform)
        {
            if (settings)
            {
                Object.assign(uniform.settings, settings);
            }
            uniform.setValueNoUpdate(value);
        }
        else
        {
            console.warn('unknown uniform: ' + JSON.stringify(name));
        }
    }

    getMaterialUniforms(target, fields)
    {
        fields = fields || new Set();

        target = target || {};
        target['_Globals'] = target['_Globals'] || {};
        target['_Globals'].value = target['_Globals'].value || {};

        const writePathValue = (target, inPath, value) =>
        {
            let path = Array.from(inPath);

            if (path.length < 1)
            {
                return target;
            }

            let cursor = target;
            while(path.length > 1)
            {
                let key = path.shift();
                if (key in cursor)
                {
                    cursor = cursor[key];
                }
                else
                {
                    cursor = (cursor[key] = {});
                }
            }

            cursor[path[0]] = value;

            return target;
        };

        Object.keys(this.uniforms.global).map(key => this.uniforms.global[key])
        .forEach(uniform => {
            if (uniform.name in ['iTime', 'iMouse', 'iResolution']) return;
            let value = uniform.value;
            if (typeof(value) !== 'undefined')
            {
                // if (typeof(fields) !== 'undefined' && typeof(fields.add) === 'function')
                    fields.add(['_Globals', 'value', uniform.name].join('>'));

                target['_Globals']['value'][uniform.name] = uniform.value;
            }
        });

        Object.keys(this.uniforms.textures).map(key => this.uniforms.textures[key])
        .forEach(((target, uniform) =>
        {
            let uniformName = `SPIRV_Cross_Combined${uniform.name}${uniform.name}Sampler`;

            if (!uniform.value)
            {
                return;
            }

            // if (typeof(fields) !== 'undefined' && typeof(fields.add) === 'function')
                fields.add([uniformName]);

            // if (uniformName in target && 'value' in target[uniformName])
            // {
                // TODO: remove old uniforms
            // }
            // else
            {
                let obj = (target[uniformName] = { type: 't' });

                obj.value = this.getTexture(uniform);
            }
        }).bind(this, target));

        return target;
    }

    getTexture(uniform)
    {
        if (!this._uniformTextures)
        {
            this._uniformTextures = {};
        }

        if (!this._uniformTexturesLoading)
        {
            this._uniformTexturesLoading = new Set();
        }

        if (uniform.name in this._uniformTextures)
        {
            let tex = this._uniformTextures[uniform.name];
            if (tex.lastUpdateTime < uniform.lastUpdateTime)
            {
                console.log(`ShaderUniforms.getTexture: texture for ${uniform.name} is out of date`);
                delete this._uniformTextures[uniform.name];
            }
            else
            {
                return tex;
            }
        }

        if (!uniform.value)
        {
            console.warn(`ShaderUniforms.getTexture: texture uniform ${uniform.name} has no value`);
            return undefined;
        }

        if (!this._uniformTexturesLoading.has(uniform.name))
        {
            this._uniformTexturesLoading.add(uniform.name);
            window.fileOpener.load(uniform.value).then(((uniform, data) =>
            {
                let tex = LoadTexture(data.data, uniform.settings, uniform.value,
                    (() => {
                        tex.lastUpdateTime = Date.now();
                        this.emit('loaded.texture');
                    }).bind(this),
                    (() => this.emit('loaded.texture')).bind(this));
                tex.lastUpdateTime = Date.now();
                this._uniformTextures[uniform.name] = tex;

                this._uniformTexturesLoading.delete(uniform.name);
            }).bind(this, uniform));
        }

        return undefined;
    }

}