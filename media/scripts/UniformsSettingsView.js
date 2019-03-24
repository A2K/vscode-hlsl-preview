
class InputFieldView extends AbstractView
{
    constructor(parent, uniform)
    {
        super(parent);

        this.uniform = uniform;
        this.type = '' + this.uniform.type;

        this.makeContextMenu(this.domElement);
    }

    setValue(value)
    {
        if (typeof(this.uniform.value.copy) === 'function')
        {
            if (typeof(value) !== 'object')
            {
                value = {
                    x: value,
                    y: value,
                    z: value,
                    w: value
                };
            }

            ['x', 'y', 'z', 'w'].forEach(key => {
                if (key in value && key in this.uniform.__value)
                {
                    this.uniform.__value[key] = value[key];
                }
            });

        }
        else
        {
            this.uniform.__value = typeof(value) === 'object' ? value.x : value;
        }

        this.uniform.lastUpdateTime = Date.now();
        this.uniform.emit('update', {
            uniform: this.uniform
        });
    }

    getValue()
    {
        console.error('InputFieldView.getValue(): pure virtual method called');
    }

    makeFloatInput(value, step, pattern)
    {
        value = value || 0;
        step = '' + (step || '0.001');
        pattern = pattern || "^([-+]?\d*\.?\d+)(?:[eE]([-+]?\d+))?$";

        let input = $(`<input type=number step=${step} value=${value} pattern="^([-+]?\d*\.?\d+)(?:[eE]([-+]?\d+))?$">`);

        input.addClass('floatInput');

        var marker;

        input.on('mousedown', ((input, event) =>
        {
            input.focus();
            /* TODO
            this.childWindows.forEach(w => {
                if (w.isContextMenu)
                {
                    w.remove();
                }
            });
            */
            var startValue = parseFloat(input.val());

            var mouseDownTime = new Date().getTime();

            var startPos = new THREE.Vector2(event.clientX, event.clientY);

            marker = $('<div>')
            .addClass('floatScrollMarker')
            .css({
                left: (event.clientX - 50) + 'px',
                top: (event.clientY - 50) + 'px',
                'z-index': window.maxZIndex++,
                opacity: 0,
                cursor: 'default'
            });

            let text = $('<p>')
            .addClass('floatScrollMarkerText')
            .text('1.00x');

            marker.append(text);

            document.onmousemove = ((input, event) =>
            {
                marker.css({
                    left: (event.clientX - 50) + 'px',
                    top: (event.clientY - 50) + 'px',
                    opacity: 1,
                    cursor: 'w-resize'
                });

                if (new Date().getTime() - mouseDownTime < 200) {
                    return true;
                }

                let pos = new THREE.Vector2(event.clientX, event.clientY);

                let speed = Math.exp(Math.max(1.0, Math.abs(startPos.y - pos.y)) * 0.01);

                if (event.shiftKey) {
                    speed = 1.0 / Math.abs(speed);
                }

                if (speed > 0.01) {
                    text.text(`${speed.toFixed(2)}x`);
                }
                else
                {
                    text.text(`${speed.toPrecision(4)}x`);
                }

                let delta = (pos.x - startPos.x) * speed;

                input.val(startValue + delta * 0.01);
                input.change();

                event.preventDefault();
                return false;
            }).bind(this, input);

            let cleanup = () => {
                document.onmouseup = null;
                document.onmousemove = null;
                document.onkeypress = null;
                document.oncontextmenu = null;
                marker.remove();
            };

            document.onmouseup = cleanup;
            document.onkeypress = cleanup;
            document.oncontextmenu = () => {
                this.input.val(startValue);
                cleanup;
            };

            $('body').append(marker);

            return true;
        }).bind(this, input));

        return input;
    }


    makeContextMenu(div)
    {
        div.on('contextmenu', ((event) =>
            this.showContextMenu(event.clientX, event.clientY)
        ).bind(this));

        return div;
    }

    showContextMenu(x, y)
    {
        let value = this.getValue();

        switch (value.length)
        {
            case 2:
                value = new THREE.Vector2(value[0], value[1]);
            break;
            case 3:
                value = new THREE.Vector3(value[0], value[1], value[2]);
            break;
            case 4:
                value = new THREE.Vector4(value[0], value[1], value[2], value[3]);
            break;
        }

        let menu = new ContextMenu(this.getWindow());

        if (typeof(value) === 'number' ||
            value instanceof String ||
            value.length === 1)
        {
            menu.addMenuItem('Copy', ((value) =>
            {
                let data = Clipboard.serialize(value);
                Clipboard.copy(data);
            }).bind(this, value));
        }
        else
        {
            menu.addMenuItem('Copy as vector', ((value) =>
            {
                let data = Clipboard.serialize(value, 'vector');
                Clipboard.copy(data);
            }).bind(this, value));

            menu.addMenuItem('Copy as color', ((value) =>
            {
                let data = Clipboard.serialize(value, 'color');
                Clipboard.copy(data);
            }).bind(this, value));
        }

        menu.addMenuItem('Paste', ((value) =>
        {
            let data = Clipboard.paste();
            data = Clipboard.deserialize(data);
            this.setValue(data);
        }).bind(this, value));

        menu.addMenuItem('Clear', ((value) =>
        {
            let data = [ 0 ] * value.length || 0;
        }).bind(this, value));

        menu.isContextMenu = true;

        menu.show(x, y);
    }
}

class IntInputFieldView extends InputFieldView
{
    constructor(parent, uniform)
    {
        super(parent, uniform);

        this.domElement.addClass('inputBox');
    }

    needsRender()
    {
        return this.lastRenderTime < this.uniform.lastUpdateTime;
    }

    render()
    {
        if (!this.input)
        {
            this.input = this.makeFloatInput(this.uniform.value, '1', "^\d+$")
            .addClass('intInput')
            .on('change input keyup', (event => {
                this.uniform.setValue(parseFloat(this.input.val()));
                this.lastRenderTime = Date.now();
            }).bind(this));

            this.domElement.append(this.input);
        }
        else
        {
            this.input.val(this.uniform.value);
        }
    }
}


class FloatInputFieldView extends InputFieldView
{
    constructor(parent, uniform)
    {
        super(parent, uniform);

        this.domElement.addClass('inputBox');
    }

    needsRender()
    {
        return this.lastRenderTime < this.uniform.lastUpdateTime;
    }

    render()
    {
        if (!this.input)
        {
            this.input = this.makeFloatInput(this.uniform.value)
            .addClass('floatInput')
            .on('change input keyup', (event => {
                this.uniform.setValue(parseFloat(this.input.val()));
                this.lastRenderTime = Date.now();
            }).bind(this));

            this.domElement.append(this.input);
        }
        else
        {
            this.input.val(this.uniform.value);
        }
    }

    getValue()
    {
        return parseFloat(this.input.val());
    }
}

class VectorInputFieldView extends InputFieldView
{
    constructor(parent, uniform)
    {
        super(parent, uniform);

        this.uniform = uniform;

        this.domElement.addClass('vectorInputBox');
        this.domElement.addClass('inputBox');

        this.fields = [];

        // this.makeContextMenu(this.domElement);
    }

    needsRender()
    {
        return this.lastRenderTime < this.uniform.lastUpdateTime;
    }

    render()
    {
        if (!this.fields.length)
        {
            this.makeVectorInput(this.uniform);
        }
        else
        {
            for(var i = 0; i < this.fields.length; ++i)
            {
                let field = this.fields[i];
                field.val(this.uniform.value[['x', 'y', 'z', 'w'][i]]);
            }
        }
    }

    makeVectorInput(uniform)
    {
        const elementsCount = {
            vec2: 2,
            vec3: 3,
            vec4: 4
        };

        const elementsNames = [ 'x', 'y', 'z', 'w' ];

        const VectorTypes = [
            THREE.Vector2,
            THREE.Vector3,
            THREE.Vector4
        ];

        for(var i = 0; i < elementsCount[uniform.type]; ++i)
        {
            let floatInput = this.makeFloatInput(uniform.value[elementsNames[i]]);

            floatInput
                .addClass(`vectorInput${elementsCount[uniform.type]}`)
                .addClass(elementsNames[i])
                .on('change input keyup', (event => {
                    let value = this.getValue();
                    this.uniform.setValue(value);
                    this.lastRenderTime = Date.now();
                }).bind(this));

            this.fields.push(floatInput);

            this.domElement.append(floatInput);
        }

        this.domElement.data('getValue', ((fields) =>
        {
            let valueArray = fields.map(field => parseFloat(field.val()));

            let type = VectorTypes[fields.length - 2];
            valueArray.unshift(type);

            let vector = new (Function.prototype.bind.apply(type, valueArray));

            this.uniform.setValue(vector);
            return vector;
        }).bind(this, this.fields));
    }

    getValue()
    {
        return this.domElement.data('getValue')();
    }

}

class UniformLabelView extends LabelView
{
    constructor(parent, uniform)
    {
        super(parent, uniform.name);

        this.uniform = uniform;
    }

    needsRender()
    {
        if (this.uniform.name !== this.text) return true;
    }

    render()
    {
        this.text = this.uniform.name;
    }
}

class UniformFieldView extends TableRowView
{
    constructor(parent, uniform)
    {
        super(parent);

        this.uniform = uniform;
    }

    needsRender()
    {
        if (super.needsRender()) return true;
        if (!this.field) return true;
        if (this.field.type !== this.uniform.type) return true;
    }

    render()
    {
        super.render();

        if (this.field && (this.field.type !== this.uniform.type))
        {
            this.field.removeFromParent();
            delete this.field;
        }

        if (!this.field)
        {
            let field;
            switch (this.uniform.type)
            {
                case 'int':
                    field = new IntInputFieldView(this.cell2, this.uniform);
                case 'float':
                    field = new FloatInputFieldView(this.cell2, this.uniform);
                break;
                case 'vec2':
                case 'vec3':
                case 'vec4':
                    field = new VectorInputFieldView(this.cell2, this.uniform);
                break;
                default:
                    console.error('unexpected uniform:', this.uniform);
                    return;
            }
            this.field = field;
        }

        if (!this.label)
        {
            this.label = new UniformLabelView(this.cell0, this.uniform);
        }

        if (!this.cell1.hasClass('spacer'))
        {
            this.cell1.addClass('spacer');
        }
    }

    getValue()
    {
        return this.field.getValue();
    }
}

class UniformsSettingsView extends GroupView
{
    constructor(parent, shader)
    {
        super(parent, "Parameters");
        this.shader = shader;
        this.domElement.addClass('UniformsSettingsView');

        this.fields = {};

        this.contextMenuBound = false;
    }

    needsRender()
    {
        if (!this.table) return true;
        return super.needsRender() ||
               this.lastRenderTime < this.shader.uniforms.lastUpdateTime;
    }

    render()
    {
        super.render();

        let uniforms = this.shader.uniforms.getGlobalUniforms();

        if (uniforms.length)
        {
            this.domElement.show();
        }
        else
        {
            this.domElement.hide();
        }

        if (!this.contextMenuBound && this.groupTitle)
        {
            this.groupTitle.on('contextmenu', ((event) => {
                let menu = new ContextMenu(this.getWindow());
                menu.addMenuItem('Copy all', (() =>
                {
                    let data = {};
                    this.table.subviews.forEach(subview => {
                        if (subview instanceof UniformFieldView)
                        {
                            let value = subview.getValue();
                            let itemData = Clipboard.serialize(value);
                            data[subview.uniform.name] = itemData;
                        }
                    });

                    Clipboard.copy(JSON.stringify(data));
                }).bind(this));
                menu.addMenuItem('Paste', (() =>
                {
                    let data = JSON.parse(Clipboard.paste());
                    Object.keys(data).forEach(name => {

                        this.table.subviews.forEach(subview => {
                            if (subview instanceof UniformFieldView)
                            {
                                if (subview.uniform.name === name)
                                {
                                    subview.uniform.setValue(Clipboard.deserialize(data[name]));
                                }
                            }
                        });
                    });
                }).bind(this));
                menu.show(event.clientX, event.clientY);
            }).bind(this));
        }

        if (!this.table)
        {
            this.table = new TableView(this, 3);
        }

        Object.keys(this.fields).forEach(name =>
        {
            if (uniforms.findIndex(u => u.name === name) < 0)
            {
                this.fields[name].row
                    .children('td, th')
                    .animate({ padding: 0 })
                    .wrapInner('<div />')
                    .children()
                    .slideUp(150, ((field) => {
                        field.row.detach();
                        this.removeSubview(field);
                    }).bind(this, this.fields[name]));
                delete this.fields[name];
            }
        });

        uniforms.forEach(uniform =>
        {
            if (!(uniform.name in  this.fields))
            {

                this.fields[uniform.name] = this.addRow(uniform);

                this.fields[uniform.name].domElement
                    .find('td')
                    .wrapInner('<div style="display: none;" />')
                    .parent()
                    .find('td > div')
                    .slideDown(150, function(){

                        var $set = $(this);
                        $set.replaceWith($set.contents());

                    });
            }
        });

    }

    addRow(uniform)
    {
        let field = new UniformFieldView(this.table, uniform);

        this.table.addRow(field);

        return field;
    }


}
