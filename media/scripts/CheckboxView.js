class CheckboxView extends AbstractView
{
    constructor(parent, value)
    {
        super(parent, '<input type="checkbox">');

        this.checked = typeof(value) === 'boolean' ? value : false;
    }

    needsRender()
    {
        return this.checked !== this.domElement.is(":checked");
    }

    render()
    {
        this.domElement.prop('checked', this.checked);
    }
}
