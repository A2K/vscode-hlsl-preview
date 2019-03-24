
class ContextMenu extends AbstractWindow
{
    constructor(parent)
    {
        super(parent);

        $('body').append(this.domElement);

        if (this.parent instanceof AbstractWindow)
        {
            this.parent.addSubwindow(this);
        }
        else if (this.parent instanceof AbstractView)
        {
            this.parent.getWindow().addSubwindow(this);
        }
    }

    addMenuItem(label, onClick)
    {
        let item = $('<div>');
        this.domElement.append(item);

        item.addClass('contextMenuItem');

        item.text(label);

        item.on('click', ((onClick) =>
        {
            event.preventDefault();
            event.stopPropagation();
            onClick();
            this.close();
        }).bind(this, onClick));

        return this;
    }

    show(x, y)
    {
        $(window).click((() =>
        {
            this.domElement.remove();
            this.parent.removeSubwindow(this);
        }).bind(this));

        this.domElement.css({
            marginLeft: x,
            marginTop: y
        });

        this.bringToTop();

        return this;
    }

    // hide()
    // {
    //     if (this.domElement)
    //     {
    //         this.domElement.detach();
    //     }

    //     return this;
    // }
}
