
class TableCellView extends AbstractView
{
    constructor(row, index)
    {
        super(row, '<td>');
        this.domElement.addClass('TableCellView');
        this.index = index;
    }
}