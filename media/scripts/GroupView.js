
class GroupView extends AbstractView
{
    constructor(parent, name)
    {
        super(parent);
        this.groupName = name;
        this.domElement.addClass('Group');
        this.expanded = true;
        this.lastRenderExpanded = this.expanded;
    }

    set expanded(value)
    {
        if (value)
        {
            this.addClass('Expanded');
            this.removeClass('Collapsed');
        }
        else
        {
            this.removeClass('Expanded');
            this.addClass('Collapsed');
        }
    }

    get expanded()
    {
        return this.domElement.hasClass('Expanded');
    }

    needsRender()
    {
        if (this.lastRenderExpanded !== this.expanded) return true;
        if (!this.groupTitle) return true;
        if (this.groupTitle.text() !== this.groupName) return true;
    }

    render()
    {
        if (!this.groupTitle)
        {
            this.domElement.prepend(
                this.groupTitle = $('<div>')
                    .addClass('Title')
                    .text(this.groupName)
                    .on('click', ((event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        this.expanded = !this.expanded;
                    }).bind(this))
            );
        }
        else
        {
            this.groupTitle.text(this.groupName);
        }

        this.lastRenderExpanded = this.expanded;
    }
}