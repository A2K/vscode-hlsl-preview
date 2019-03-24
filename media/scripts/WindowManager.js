class WindowManager extends Renderable
{
    constructor(domElement)
    {
        super(null);

        this.domElement = domElement;

        this.windows = new Set();

        this.maxZIndex = 0;
    }

    getNextZIndex()
    {
        return ++this.maxZIndex;
    }

    bringToTop(win)
    {
        if (win.zIndex !== this.maxZIndex)
        {
            win.zIndex = this.getNextZIndex();
        }
    }

    isOnTop(win)
    {
        return win.zIndex === this.maxZIndex;
    }

    addWindow(win)
    {
        if (!this.windows.has(win))
        {
            this.windows.add(win);
            this.domElement.append(win.domElement);
        }
    }

    removeWindow(win)
    {
        if (this.windows.has(win))
        {
            this.windows.remove(win);
            win.domElement.detach();
        }
    }

    needsRender()
    {
        return false;
    }

    render()
    {
    }

    renderTree()
    {
        this.windows.forEach(win => win.renderTree(this));
    }

    addSubview(subview)
    {
        console.error('Invalid method called: WindowManager.addSubview');
    }

    removeSubview(subview)
    {
        console.error('Invalid method called: WindowManager.removeSubview');
    }

    replaceSubview(view, replacement)
    {
        console.error('Invalid method called: WindowManager.replaceSubview');
    }
}