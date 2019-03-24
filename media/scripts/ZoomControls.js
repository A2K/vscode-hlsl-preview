
class ZoomControls
{
    constructor(domElement, options)
    {
        this.domElement = domElement;

        this._m = {};

        this.options = options || {};

        this.options.zoomStep = this.options.zoomStep || 0.25;

        this.zoom = 1.0;
        this.zoomTarget = 1.0;

        this.zoomAnimStartTime = window.renderer.shaderTime;

        this.zoomAnimDuration = 30.0;

        this.offset = new THREE.Vector2(0, 0);

        this.domElement.on('mousewheel', this._m.wheel = this.handleScroll.bind(this));
        this.domElement.on('mousedown', this._m.down = this.handleMouseDown.bind(this));
        this.domElement.on('mouseup', this._m.up = this.handleMouseUp.bind(this));
        this.domElement.on('mousemove', this._m.move = this.handleMouseMove.bind(this));

        this.anim = $('<div>').css({ height: this.zoomTarget });

        this.location = new THREE.Vector2(0, 0);
    }

    dispose()
    {
        if (this._m)
        {
            this.domElement.off('mousewheel', this._m.wheel);
            this.domElement.off('mousedown', this._m.down);
            this.domElement.off('mouseup', this._m.up);
            this.domElement.off('mousemove', this._m.move);
        }

        this._m = {};
    }

    handleScroll(e)
    {
        if(e.originalEvent.wheelDelta / 120 > 0)
        {
            this.zoomTarget /= 1 + this.options.zoomStep;
        }
        else
        {
            this.zoomTarget *= 1 + this.options.zoomStep;
        }

        let duration = this.zoomAnimDuration;

        if (this.zoomAnimStartTime + this.zoomAnimDuration > window.renderer.shaderTime)
        {
            this.zoomAnimStartTime = window.renderer.shaderTime;
        }
        else
        {
            duration = window.renderer.shaderTime - (this.zoomAnimStartTime + this.zoomAnimDuration);
        }

        this.anim.animate({ height: this.zoomTarget }, {
            duration: this.zoomAnimDuration,
            step: ((value) =>
            {
                this.zoom = value;
            }).bind(this)
        });
    }

    handleMouseDown(event)
    {
        this.dragging = true;
        if (!this.dragStart)
        {
            this.dragStart = new THREE.Vector2(event.clientX, event.clientY);
        }
        else
        {
            this.dragStart.set(event.clientX, event.clientY);
        }

        if (!this.dragStartOffset)
        {
            this.dragStartOffset = new THREE.Vector2(this.offset.x, this.offset.y);
        }
        else
        {
            this.dragStartOffset.set(this.offset.x, this.offset.y);
        }
    }

    handleMouseUp(event)
    {
        if (this.dragging)
        {
            this.location.set(event.clientX, event.clientY);
            this.location.sub(this.dragStart);
            this.location.multiplyScalar(this.zoom);
            this.offset.copy(this.dragStartOffset).sub(this.location);

            this.dragging = false;
        }
    }

    handleMouseMove(event)
    {
        if (this.dragging)
        {
            if (event.buttons !== 1)
            {
                this.dragging = false;
                return;
            }

            this.location.set(event.clientX, event.clientY);
            this.location.sub(this.dragStart);
            this.location.multiplyScalar(this.zoom);
            this.offset.copy(this.dragStartOffset).sub(this.location);
        }
    }
}