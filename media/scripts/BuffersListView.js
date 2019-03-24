class BufferLabelView extends LabelView
{
    constructor(parent, buffer)
    {
        super(parent, buffer.name);

        this.buffer = buffer;

        this.domElement.on('contextmenu', ((label, event) =>
        {
            this.editing = true;
            let origValue = label.text();

            const isValid = (name) => {
                const re = /^[a-zA-Z_$][a-zA-Z_$0-9]*$/;
                return re.test(name);
            };

            const endEditing = ((label) => {
                this.editing = false;
                label.attr('contenteditable','false');
                if (isValid(label.text()))
                {
                    this.buffer.name = label.text();
                }
                else
                {
                    // TODO: show error message
                    label.text(origValue);
                }
                return false;
            }).bind(this, label);

            label.attr('contenteditable','true');
            label.focusout(() => {
                endEditing();
            });
            label.keypress((e) =>
            {
                let key = e.which;
                if(key == 13)  // the enter key code
                {
                    endEditing();
                }
                return true;
            });
            label.focus();
        }).bind(this, this.domElement));
    }

    needsRender()
    {
        if (this.editing) return false;
        if (this.buffer.name !== this.text) return true;
    }

    render()
    {
        this.text = this.buffer.name;
    }
}

class BufferListItemView extends AbstractView
{
    constructor(parent, buffer)
    {
        super(parent);
        this.buffer = buffer;

        this.settingsWindows = {};

        this.buffer.on('remove', () => {
            this.removeFromParent();
        });
    }

    needsRender()
    {
        if (!this.handle) return true;
        if (!this.label) return true;
        if (!this.options) return true;
        if (!this.preview) return true;
        if (!this.removeButton) return true;
        if (this.preview.hasClass('Enabled') && this.buffer !== window.renderer.previewBuffer) return true;
    }

    render()
    {
        let item = this.domElement;

        if (!this.handle)
        {
            let handle = $('<div>');
            item.append(handle);
            handle.addClass('Handle');
            handle.text('≡');
            this.handle = handle;
        }

        if (!this.preview)
        {
            let preview = $('<div>');
            item.append(preview);
            preview.addClass('BufferPreview');
            preview.text('👁');
            preview.on('click', ((preview, event) => {
                event.preventDefault();
                event.stopPropagation();
                if (preview.hasClass('Enabled'))
                {
                    window.renderer.setPreviewBuffer();
                    preview.removeClass('Enabled');
                }
                else
                {
                    window.renderer.setPreviewBuffer(this.buffer);
                    preview.addClass('Enabled');
                }
            }).bind(this, preview));

            this.preview = preview;
        }
        else
        {
            if ((window.renderer.previewBuffer === this.buffer) &&
                (!this.preview.hasClass('Enabled')))
            {
                this.preview.addClass('Enabled');
            }
            else if ((window.renderer.previewBuffer !== this.buffer) &&
                     (this.preview.hasClass('Enabled')))
            {
                this.preview.removeClass('Enabled');
            }
        }

        if (this.buffer == window.renderer.previewBuffer)
        {
            if (!this.preview.hasClass('Enabled')) {
                this.preview.addClass('Enabled');
            }
        }
        else
        {
            if (this.preview.hasClass('Enabled')) {
                this.preview.removeClass('Enabled');
            }
        }

        if (!this.options)
        {
            let options = $('<div>');
            item.append(options);
            options.addClass('BufferSettings');
            options.text('🛠');
            options.on('click', ((event) => {
                event.preventDefault();
                event.stopPropagation();
                let shaderSettings;
                if (this.buffer.shader.documentId in this.settingsWindows)
                {
                    shaderSettings = this.settingsWindows[this.buffer.shader.documentId];
                }
                else
                {
                    shaderSettings = new ShaderSettingsWindow(this, this.buffer);
                    this.settingsWindows[this.buffer.shader.documentId] = shaderSettings;
                }
                this.getWindow().addSubwindow(shaderSettings);

                let x = event.clientX;
                let y = event.clientY;
                shaderSettings.domElement.css({
                    left: x - 20,
                    top: y - 15
                });

                shaderSettings.bringToTop();
                shaderSettings.show();
            }).bind(this));
            this.options = options;
        }

        if (!this.label)
        {
            this.label = new BufferLabelView(this, this.buffer);
        }

        if (!this.removeButton)
        {
            let remove = $('<div>');
            item.append(remove);
            remove.addClass('BufferRemove');
            remove.text('✖');
            remove.on('click', (() => {
                event.preventDefault();
                event.stopPropagation();
                // this.buffer.emit('remove', { buffer: this.buffer });
                this.buffer.shader.emit('remove', { shader: this.buffer.shader });
                // this.removeFromParent();
            }).bind(this));
            this.removeButton = remove;
        }
    }
}

class BuffersListView extends GroupView
{
    constructor(parent, buffers)
    {
        super(parent, 'Buffers');

        this.buffers = buffers;

        if (!this.fields) this.fields = {};
        this.buffers.forEach(buffer => {
            if (!this.fields[buffer.shader.documentId])
            {
                this.fields[buffer.shader.documentId] = this.addBufferItem(buffer);
            }
        });

        this.domElement.sortable(
        {
            // SortableJS options go here
            // See: (https://github.com/SortableJS/Sortable#options)

            group: { name: "Buffers", pull: [false, false, 'clone'], put: [false, false] },
            animation: 150,  // ms, animation speed moving items when sorting, `0` — without animation
	        easing: "cubic-bezier(1, 0, 0, 1)",
            draggable: '.BufferListItemView',
            handle: '.Handle',
            invertSwap: false,
            direction: 'vertical',
            onUpdate: this.onBuffersUpdated.bind(this)
        });
    }

    onBuffersUpdated(event)
    {
        console.log(`buffer moved from index ${event.oldIndex} to ${event.newIndex}`);
        console.log(`from ${event.from} to ${event.to}`);
        console.log('onBuffersUpdated:', Object.keys(event));
        [this.buffers[event.oldIndex - 1], this.buffers[event.newIndex - 1]] =
            [this.buffers[event.newIndex - 1], this.buffers[event.oldIndex - 1]];
        // TODO: save new buffer order to workspace storage

    }

    addBufferItem(buffer)
    {
        let item = new BufferListItemView(this, buffer);
        return item;
    }

    needsRender()
    {
        if (super.needsRender()) return true;
        return true;
    }

    render()
    {
        super.render();

        if (this.buffers.length)
        {
            if (!this.fields) this.fields = {};
            this.buffers.forEach(buffer => {
                if (!this.fields[buffer.shader.documentId])
                {
                    this.fields[buffer.shader.documentId] = this.addBufferItem(buffer);
                }
            });
            // console.warn('BuffersListView: no buffers set!');
            this.domElement.show();
        }
        else
        {
            this.domElement.hide();
            // console.warn('BuffersListView: no buffers set!');
        }
    }
}
