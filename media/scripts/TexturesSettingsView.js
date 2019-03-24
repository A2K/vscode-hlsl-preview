class TextureSettingsFieldView extends TableRowView
{
    constructor(parent, texture, buffers)
    {
        super(parent);

        this.texture = texture;

        this.buffers = buffers;

        this.row = this.domElement;
    }

    needsRender()
    {
        if (!this.label) return true;
        if (!this.activationButton) return true;
        if (!this.display) return true;
        if (super.needsRender()) return true;
        return this.lastRenderTime < this.texture.lastUpdateTime ||
        this.lastRenderTime < this.buffers.lastUpdateTime;
    }

    render()
    {
        super.render();

        if (!this.label)
        {
            this.label = new LabelView(this.cell0, this.texture.name);
        }
        else
        {
            this.label.text = this.texture.name;
        }

        if (!this.activationButton)
        {
            this.cell1.domElement.append(this.activationButton = this.makeActivationButton());
        }

        if (!this.display)
        {
            let display = $('<div>');
            display.addClass('displayFileInput');

            if (!this.displayOpen)
            {
                this.displayOpen = $('<div>');
                this.displayOpen.addClass('displayOpen');
                this.displayOpen.text('🗁');
            }

            display.append(this.displayOpen);

            let displayFilename = $('<div>');
            displayFilename.addClass('Filename');
            displayFilename.addClass('displayFilename');
            this.displayFilename = displayFilename;

            this.cell2.domElement.data('setFilename', ((displayFilename, filename) => {
                this.displayFilename.text(filename);
            }).bind(this, displayFilename));

            display.append(displayFilename);

            display.on('click', ((event) => {
                if (!this.buffers.contains(this.texture.name))
                {
                    event.preventDefault();
                    event.stopPropagation();
                    this.openFile();
                }
            }).bind(this));

            this.cell2.domElement.data('display', display);

            this.cell2.domElement.append(display);

            this.display = display;
        }

        this.updateDisplay();
    }

    updateDisplay()
    {
        if (this.buffers.contains(this.texture.name))
        {
            this.displayOpen.hide();
            this.cell1.domElement.hide();
            if (this.cell2.hasClass('Empty'))
            {
                this.cell2.removeClass('Empty');
            }
            if (this.displayFilename) this.displayFilename.text(`<Buffer>`);
            if (!this.cell2.hasClass('BufferBound'))
            {
                this.cell2.addClass('BufferBound');
            }
        }
        else
        {
            this.displayOpen.show();
            this.cell1.domElement.show();
            if (this.cell2.hasClass('BufferBound'))
            {
                this.cell2.removeClass('BufferBound');
            }

            if (this.texture.value)
            {
                if (this.cell2.hasClass('Empty'))
                {
                    this.cell2.removeClass('Empty');
                }
                if (this.displayFilename) this.displayFilename.text(this.getBaseName(this.texture.value));
            } else {
                if (!this.cell2.hasClass('Empty'))
                {
                    this.cell2.addClass('Empty');
                }
                if (this.displayFilename) this.displayFilename.text('<empty>');
            }
        }
    }

    openFile()
    {
        window.fileOpener.open().then((data =>
        {
            this.texture.setValue(data.filename);
        }).bind(this));
    }

    getBaseName(path)
    {
        return (path || ['/unknown']).split(/[/\\]/).pop();
    }

    makeActivationButton()
    {
        let button = $('<div>');
        button.addClass('textureSettingsActivationButton');

        button.text('🛠');

        button.on('click', (event =>
        {
            event.preventDefault();
            event.stopPropagation();
            this.showTextureSettingsWindow(event.clientX, event.clientY);
        }).bind(this));

        return button;
    }

    showTextureSettingsWindow(x, y)
    {
        let w = new TextureSettingsWindow(this, this.texture);
        this.getWindow().addSubwindow(w);
        w.show(x, y);
    }
}

class TexturesSettingsView extends GroupView
{
    constructor(parent, shader, buffers)
    {
        super(parent, "Textures");
        this.domElement.addClass('TextureSettingsView');
        this.shader = shader;
        this.buffers = buffers;

        this.fields = {};
    }

    needsRender()
    {
        if (super.needsRender()) return true;
        if (!this.table) return true;
        return this.lastRenderTime < this.shader.uniforms.lastUpdateTime;
    }

    render()
    {
        super.render();

        if (!this.table)
        {
            this.table = new TableView(this, 3);
        }

        let textures = this.shader.uniforms.getTextureUniforms();

        if (textures.length)
        {
            this.domElement.show();
        }
        else
        {
            this.domElement.hide();
        }

        Object.keys(this.fields).forEach(name =>
        {
            if (textures.findIndex(tex => tex.name === name) < 0)
            {
                this.table.removeSubview(this.fields[name]);
                delete this.fields[name];
            }
        });

        textures.forEach(texture =>
        {
            if (texture.name in this.fields) return;

            let field = new TextureSettingsFieldView(this.table, texture, this.buffers);
            this.table.addRow(field);
            // field.row.detach();
            // this.table.append(field.row);
            this.fields[texture.name] = field;
        });
    }

}
