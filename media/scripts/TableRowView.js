
class TableRowView extends AbstractView
{
    constructor(table)
    {
        super(table, '<tr>');

        this.row = this.domElement;

        this.table = table;

        this._cells = {};

        for(let i = 0; i < table.columns; ++i)
        {
            let key = `cell${i}`;
            let cell = new TableCellView(this, i);
            this._cells[key] = cell;
            this[key] = cell;
        }
    }

    needsRender()
    {
        return false;
    }

    render()
    {
        super.render();
    }
}