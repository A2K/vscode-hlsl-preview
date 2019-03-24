class LabelView extends AbstractView
{
    constructor(parent, text, forTarget)
    {
        if (forTarget)
        {
            super(parent, `<label for="${forTarget.attr('id')}">`);
        }
        else
        {
            super(parent, `<label>`);
        }

        this.domElement.text(text);
    }

    needsRender()
    {
        return false;
    }

    set text(value)
    {
        this.domElement.text(value);
    }

    get text()
    {
        return this.domElement.text();
    }
}
