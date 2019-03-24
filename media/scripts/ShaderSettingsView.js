

class ShaderSettingsView extends ScrollView
{
    constructor(parent, shader)
    {
        super(parent);

        this.shader = shader;

        this.domElement.addClass('ShaderSettings');
        // this.domElement.addClass('settingsScrollBox');

        this.textureSettingsInstances = {};

    }

    needsRender()
    {
        return typeof(this.ifdefs) === 'undefined' ||
               typeof(this.uniforms) === 'undefined' ||
               typeof(this.textures) === 'undefined';
    }

    render()
    {
        if (!this.ifdefs)
        {
            this.ifdefs = new IfdefsSettingsView(this, this.shader);
        }

        if (!this.uniforms)
        {
            this.uniforms = new UniformsSettingsView(this, this.shader);
        }

        if (!this.textures)
        {
            this.textures = new TexturesSettingsView(this, this.shader, window.renderer.buffers);
        }
    }

    getTextureSettings(name, file, onUpdate, textureSettingsSettings)
    {
        var instance = this.textureSettingsInstances[name];

        if (!instance)
        {
            instance = new TextureSettingsWindow(this, file, onUpdate, name, textureSettingsSettings);
            this.textureSettingsInstances[name] = instance;
        }

        return instance;
    }

    getSerializedUniforms()
    {
        let serializedUniforms = {};

        Object.keys(this.uniformsValues).forEach(key =>
        {
            if (this.uniformsValues[key]['type'] === 't')
            {
                serializedUniforms[key] =
                {
                    type: 't',
                    filename: this.uniformsValues[key]['filename'],
                    settings: this.uniformsValues[key]['settings']
                };
            }
            else
            {
                serializedUniforms[key] = this.uniformsValues[key];
            }
        });

        return serializedUniforms;
    }

}
