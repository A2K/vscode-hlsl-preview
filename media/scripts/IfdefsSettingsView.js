class IfdefCheckboxView extends CheckboxView
{
    constructor(parent, ifdef)
    {
        super(parent, ifdef.enabled);

        this.ifdef = ifdef;

        this.domElement.on('change click input keyup', (() =>
        {
            this.checked = this.domElement.is(":checked");
            this.ifdef.enabled = this.checked;
        }).bind(this));

        this.domElement.addClass('ifdefCheckbox');
    }
}

class IfdefFieldView extends TableRowView
{
    constructor(parent, ifdef)
    {
        super(parent);

        this.ifdef = ifdef;
        Object.defineProperty(this, 'lastUpdateTime', {
            enumerable: true,
            get: (() => this.ifdef.lastUpdateTime).bind(this)
        });
    }

    needsRender()
    {
        if (super.needsRender()) return true;

        if (!this.label) return true;
        if (!this.cell1.hasClass('spacer')) return true;
        if (!this.checkbox) return true;
    }

    render()
    {
        super.render();

        if (!this.cell1.hasClass('spacer'))
        {
            this.cell1.addClass('spacer');
        }

        if (!this.checkbox)
        {
            this.checkbox = new IfdefCheckboxView(this.cell0, this.ifdef);
            this.checkbox.domElement.attr('id', 'checkbox_' + this.ifdef.name + '__' + Math.random());
        }

        if (!this.label)
        {
            this.label = new LabelView(this.cell2, this.ifdef.name, this.checkbox.domElement);
        }
    }

}

class IfdefsSettingsView extends GroupView
{

    constructor(parent, shader)
    {
        super(parent, "Defines");

        this.shader = shader;

        this.fields = {};
    }

    needsRender()
    {
        if (super.needsRender()) return true;
        if (!this.table) return true;
        return this.shader.ifdefs.lastUpdateTime > this.lastRenderTime;
    }

    render()
    {

        super.render();

        if (!this.table)
        {
            this.table = new TableView(this, 3);
        }

        if (!this.contextMenuBound && this.groupTitle)
        {
            this.groupTitle.on('contextmenu', ((event) => {
                let menu = new ContextMenu(this.getWindow());
                menu.addMenuItem('Copy all', (() =>
                {
                    let data = this.table.subviews
                        .filter(subview => subview.ifdef.enabled)
                        .map(subview => subview.ifdef.name)
                        .join(',');
                    Clipboard.copy(data);
                }).bind(this));
                menu.addMenuItem('Paste', (() =>
                {
                    let data = Clipboard.paste() || '';
                    let enabled = new Set(data.split(/\s*,\s*/));

                    this.table.subviews.forEach(subview => {
                        if (subview instanceof IfdefFieldView)
                        {
                            subview.ifdef.enabled = enabled.has(subview.ifdef.name);
                        }
                    });
                }).bind(this));
                menu.show(event.clientX, event.clientY);
            }).bind(this));
        }

        let validIfdefs = new Set();
        this.shader.ifdefs.ifdefs.forEach(ifdef =>
        {
            validIfdefs.add(ifdef.name);
            if (!(ifdef.name in this.fields))
            {
                let field = new IfdefFieldView(this.table, ifdef);
                this.fields[ifdef.name] = field;
            }
        });

        Object.keys(this.fields).filter(key => !validIfdefs.has(key)).forEach(name => {
            let field = this.fields[name];
            this.table.removeSubview(field);
            delete this.fields[name];
        });

        if (Object.keys(this.fields).length)
        {
            this.domElement.show();
        }
        else
        {
            this.domElement.hide();
        }
    }

}
