
class AbstractWindow extends Renderable
{
    constructor(parent, elementTemplate = '<div>')
    {
        super(parent);

        if (parent)
        {
            let parentWindow = this.getParentWindow();
            if (parentWindow) parentWindow.addSubwindow(this);
        }

        this.domElement = $(elementTemplate|| '<div>');

        this.domElement.addClass('AbstractWindow');

        $('body').append(this.domElement);

        this.domElement.addClass(this.constructor.name);

        this.domElement.on('mousedown focus click', this.bringToTop.bind(this));

        this._subwindows = new Set();
        this.subwindows = {
            add: ((item) =>
            {
                let result = this._subwindows.add(item);
                this.updateHoverState();
                return result;
            }).bind(this),
            remove: ((item) =>
            {
                if (this._subwindows.has(item))
                {
                    let result = this._subwindows.delete(item);
                    this.updateHoverState();
                    return result;
                }
            }).bind(this),
            contains: ((item) =>
            {
                return this._subwindows.has(item);
            }).bind(this),
            forEach: this._subwindows.forEach.bind(this._subwindows)
        };

        Object.defineProperty(this.subwindows, 'length', {
            enumerable: true,
            get: () => this._subwindows.size
        });
    }

    getWindowManager()
    {
        if (!this.parent)
        {
            return null;
        }
        if (this.parent instanceof WindowManager)
        {
            return this.parent;
        }
        else if (this.parent instanceof AbstractView)
        {
            let win = this.parent.getWindow();
            if (win)
            {
                return win.getWindowManager();
            }
        }
        else if (this.parent instanceof AbstractWindow)
        {
            return this.parent.getWindowManager();
        }
    }

    set zIndex(value)
    {
        this.domElement.css({
            'z-index': value
        });
    }

    get zIndex()
    {
        return this.domElement.css('z-index') || undefined;
    }

    addSubwindow(w)
    {
        this.subwindows.add(w);
    }

    removeSubwindow(w)
    {
        this.subwindows.remove(w);
    }

    postMessage(type, data)
    {
        window.events.emit('postMessage', { type: type, data: data || {} });
    }

    updateHoverState()
    {
        if (this._subwindows.size > 0)
        {
            if (!this.domElement.hasClass('hover'))
            {
                this.domElement.addClass('hover');
            }
        }
        else
        {
            if (this.domElement.hasClass('hover'))
            {
                this.domElement.removeClass('hover');
            }
        }
    }

    bringToTop()
    {
        let windowManager = this.getWindowManager();
        if (windowManager)
        {
            windowManager.bringToTop(this);
        }
    }

    isOnTop()
    {
        let windowManager = this.getWindowManager();
        if (windowManager)
        {
            return windowManager.isOnTop(this);
        }
    }

    show()
    {
        if (0 === this.domElement.parent().length)
        {
            this.domElement.hide();

            $('body').append(this.domElement);
        }

        this.domElement.fadeIn({ duration: 250 });

        this.onDidShow();
    }

    close()
    {
        if (this.domElement.parent().length > 0)
        {
            this.domElement.fadeOut({
                duration: 100,
                complete: () =>
                {
                    this.domElement.detach();
                }
            });
        }

        this.onDidClose();
    }

    getParentWindow()
    {
        if (this.parent)
        {
            if (this.parent instanceof AbstractWindow)
            {
                return this.parent;
            }
            else if (this.parent instanceof AbstractView)
            {
                return this.parent.getWindow();
            }
        }
    }

    onDidShow()
    {
        let parentWindow = this.getParentWindow();
        if (parentWindow) parentWindow.addSubwindow(this);
    }

    onDidClose()
    {

        let parentWindow = this.getParentWindow();
        if (parentWindow) parentWindow.removeSubwindow(this);
    }

    addSubview(subview)
    {
        super.addSubview(subview);
        this.content.append(subview.domElement);
    }

    renderTree(parent)
    {
        this.subwindows.forEach(window => {
            window.renderTree(this);
        });

        super.renderTree(parent);
    }
}
