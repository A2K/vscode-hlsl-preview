
class AbstractView extends Renderable
{
    // It is important to override the constructor in subclasses

    constructor(parent, baseElement = '<div>')
    {
        super(parent);

        baseElement = baseElement || '<div>';

        this.domElement = $(baseElement);
        this.domElement.addClass(this.constructor.name);

        if (parent)
        {
            parent.addSubview(this);
        }

        this.lastRenderTime = 0;

        this.content = this.domElement;

        this.hidden = false;

        this.animationDuration = 150;
    }

    data(key, value)
    {
        return this.domElement.data(key, value);
    }

    hasClass(className)
    {
        return this.domElement.hasClass(className);
    }

    addClass(className)
    {
        if (!this.domElement.hasClass(className))
        {
            this.domElement.addClass(className);
        }
    }

    removeClass(className)
    {
        if (this.domElement.hasClass(className))
        {
            this.domElement.removeClass(className);
        }
    }

    show()
    {
        if (this.hidden)
        {
            this.domElement.slideDown(this.animationDuration);
            this.hidden = false;
        }
    }

    hide()
    {
        if (!this.hidden)
        {
            this.domElement.slideUp(this.animationDuration);
            this.hidden = true;
        }
    }

    removeFromParent()
    {
        if (this.parent)
        {
            this.parent.removeSubview(this);
            this.parent = null;
        }
    }

    postMessage(type, data)
    {
        window.events.emit('postMessage', { type: type, data: data || {} });
    }

    addSubview(subview)
    {
        super.addSubview(subview);
        this.domElement.append(subview.domElement);
    }

    removeSubview(subview)
    {
        subview.domElement.detach();
        super.removeSubview(subview);
    }

    getWindow()
    {
        if (this.parent)
        {
            if (this.parent instanceof AbstractWindow)
            {
                return this.parent;
            }
            else
            {
                return this.parent.getWindow();
            }
        }
        return undefined;
    }

}
