

class HeaderWindow extends AbstractWindow
{
    constructor(parent, title)
    {
        super(parent);

        this.domElement.addClass('HeaderWindow');

        this.domElement.hide();

        this.header = this.makeHeader(title);

        this.content = $('<div>');

        this.content.append(this.header);

        this.domElement.append(this.content);

        this.content.addClass('WindowContent');

        this.content.append($('<div>').addClass('HeaderSpacer'));
    }

    makeHeader(title)
    {
        let header = $('<div>');
        this.domElement.append(header);
        header.addClass('Header');

        this.headerText = $('<div>')
            .text(title)
            .addClass('HeaderText');

        header.append(this.headerText);
        // header.text(title);

        header.on('mousedown', ((e) => {
            e = e || window.event;
            e.preventDefault();

            var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

            pos3 = e.clientX;
            pos4 = e.clientY;

            let startLeft = parseFloat(this.domElement.css('left')) || 0;
            let startTop = parseFloat(this.domElement.css('top')) || 0;

            let startX = e.clientX;
            let startY = e.clientY;
            let transitionOrigValue = this.domElement.css('transition');

            let cleanup = () =>
            {
                window.onmouseup = null;
                window.onmousemove = null;
                this.domElement.css({
                    transition: transitionOrigValue
                });

                if (typeof(this.onWindowMoved) == 'function')
                {
                    this.onWindowMoved();
                }
            };

            window.onmouseup = (e) => {

                e.preventDefault();
                cleanup();
            };
            window.onmousemove = ((e) => {
                e = e || window.event;
                e.preventDefault();

                if (e.buttons !== 1)
                {
                    cleanup();
                    return;
                }

                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;

                pos3 = e.clientX;
                pos4 = e.clientY;

                let dx = e.clientX - startX;
                let dy = e.clientY - startY;

                this.domElement.css({
                    transition: '0s',
                    left: startLeft + dx,
                    top: startTop + dy
                });
            }).bind(this);

            this.bringToTop();
        }).bind(this));


        this.closeButton = $('<div>')
            .addClass('HeaderCloseButton');

        header.append(this.closeButton);

        this.closeButton.on('click', (() => {
            event.preventDefault();
            event.stopPropagation();
            this.close();
        }).bind(this));

        return header;
    }

}
