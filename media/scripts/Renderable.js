
class Renderable
{
    constructor(parent)
    {
        this.parent = parent || null;

        this.subviews = [];

        this.lastRenderTime = 0;
        // this.renderStateDirty = true;
    }

    addSubview(subview)
    {
        subview.parent = this;
        this.subviews.push(subview);
    }

    removeSubview(subview)
    {
        let index = this.subviews.indexOf(subview);

        if (index >= 0)
        {
            this.subviews.splice(index, 1);
        }

        if (subview.parent === this)
        {
            subview.parent = null;
        }
    }

    replaceSubview(view, replacement)
    {
        let viewIndex = this.subviews.indexOf(view);
        if (viewIndex < 0)
        {
            console.error('Renderable: replaceSubview: can not replace view which is not a subview:', view);
            return;
        }

        view.domElement.replaceWith(replacement.domElement);

        this.subviews.splice(viewIndex, 1, replacement);

        if (view.parent === this)
        {
            view.parent = null;
        }

        replacement.parent = this;
    }

    needsRender()
    {
        return true;
    }

    render()
    {

    }

    renderTree(parent)
    {
        if (this.needsRender())
        {
            this.render();
            this.lastRenderTime = Date.now();
        }

        this.subviews.forEach(subview =>
            subview.renderTree(this)
        );
    }
}
