
class ScrollView extends AbstractView
{
    constructor(parent)
    {
        super(parent);
        if (this.constructor.name !== 'ScrollView') {
            this.domElement.addClass('ScrollView');
        }
    }

}
