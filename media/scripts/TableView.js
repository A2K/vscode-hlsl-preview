
class TableView extends AbstractView
{
    constructor(parent, columns)
    {
        super(parent, '<table>');

        this.columns = columns;

        this.table = this.domElement;
        this.table.addClass('TableView');

        this._domElementHidden = false;
    }

    needsRender()
    {
        return false;
    }

    addRow(view)
    {
        this.addSubview(view);
    }

    show()
    {
        if (this.hidden)
        {
            this.domElement.fadeIn(this.animationDuration);
            this.hidden = false;
        }
    }

    hide()
    {

        if (!this.hidden)
        {
            this.hidden = true;
            this.domElement.fadeOut(this.animationDuration);
        }
    }

}