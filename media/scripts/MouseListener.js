class MouseListener
{
    constructor()
    {
        this.state = {
            left: -1,
            right: -1
        };

        this.lastLocation = new THREE.Vector2(0, 0);

        $('body').on('mousemove', this.onMouseMove.bind(this));

        $('body').on('mousedown', this.onMouseDown.bind(this));

        $('body').on('mouseup', this.onMouseUp.bind(this));
    }

    get x()
    {
        return this.lastLocation.x / window.innerWidth;
    }

    get y()
    {
        return this.lastLocation.y / window.innerHeight;
    }

    setButtonDownValue(key, isPressed)
    {
        if (isPressed)
        {
            if (this.state[key] >= 0)
            {

            }
            else
            {
                this.state[key] = Date.now();
            }
        }
        else
        {
            this.state[key] = -1;
        }
    }

    set leftButtonDown(isPressed)
    {
        this.setButtonDownValue('left', isPressed);
    }

    set rightButtonDown(isPressed)
    {
        this.setButtonDownValue('right', isPressed);
    }

    get durationLeftDown()
    {
        return this.state.left ? Date.now() - this.state.left : -1;
    }

    get durationRightDown()
    {
        return this.state.right ? Date.now() - this.state.right : -1;
    }

    updateMouseFromEvent(event)
    {
        /*
            0 : No button or un-initialized
            1 : Primary button (usually the left button)
            2 : Secondary button (usually the right button)
            4 : Auxilary button (usually the mouse wheel button or middle button)
            8 : 4th button (typically the "Browser Back" button)
            16 : 5th button (typically the "Browser Forward" button)
        */

        this.leftButtonDown = (event.buttons === 1);
        this.rightButtonDown = (event.buttons === 2);

        this.lastLocation.x = event.clientX;
        this.lastLocation.y = event.clientY;
    }

    onMouseMove(event)
    {
        // console.log('MouseListener.onMouseMove', event.clientX, event.clientY);
        this.updateMouseFromEvent(event);
    }

    onMouseDown(event)
    {
        // console.log('MouseListener.onMouseDown', event.clientX, event.clientY);
        this.updateMouseFromEvent(event);
    }

    onMouseUp(event)
    {
        // console.log('MouseListener.onMouseUp', event.clientX, event.clientY);
        this.updateMouseFromEvent(event);
    }
}