

class SettingsWindow extends HeaderWindow
{
    constructor(parent, shaderReactor)
    {
        super(parent, "Settings");

        if (!shaderReactor)
        {
            console.error('SettingsWindow: shaderReactor argument is required!');
            return;
        }

        this.shaderReactor = shaderReactor;

        this.hidden = false;

        if (!this.error)
        {
            // this.error = this.makeErrorView();
            // $('body').append(this.error);
            // this.error.hide();
        }

        this.domElement.addClass('Settings');

        this.modeSwitch = this.makeModeSwitch();
        this.content.append(this.modeSwitch);

        this.buttons = $('<div>').addClass('buttons');

        this.buttons.append(
            $('<div>')
            .addClass('button')
            .text('Recompile')
            .css({ cursor: 'pointer' })
            .on('click', (() => {
                this.postMessage('update');
            }).bind(this))
        );

        this.buttons.append(
            $('<div>')
            .addClass('button')
            .text('Render to file')
            .css({ cursor: 'pointer' })
            .on('click', (() => {
                this.postMessage('selectSaveImage');
            }).bind(this))
        );

        this.content.append(this.buttons);

        this.buffersList = new BuffersListView(this, window.renderer.buffers);

        // this.meshSettings = this.makeMeshSettings();
        // this.content.append(this.meshSettings);

        this.button = this.makeHideButton();

        this.domElement.append(this.button);

        if (!this.hidden)
        {
            this.button.hide();
        }

        $('body').append(this.domElement);

        let transition = this.content.css('transition');
        this.content.css({ transition: '0s' });
        this.toggleHidden(0);
        setTimeout(() => {
            this.content.css({ transition: transition });
        }, 10);

        // this.buffersList = new BuffersListView(this);

        this.fragmentShaderSettings = new AbstractView(this);
        this.fragmentShaderSettings.needsRender = () => false;

        this.show();

        this.shaderReactor.on('update.fragment', (event) =>
        {
            let shader = this.shaderReactor.getFragmentShader();
            if (shader)
            {
                if (!this.fragmentShaderSettings || this.fragmentShaderSettings.shader !== shader)
                {
                    let shaderSettings = new ShaderSettingsView(this, shader);
                    this.replaceSubview(this.fragmentShaderSettings, shaderSettings);
                    this.fragmentShaderSettings = shaderSettings;
                }
            }
        });
    }

    onWindowMoved()
    {
        this.postMessage('updateSettings', {
            settings: {
                position: {
                    left: this.domElement.css('left'),
                    top: this.domElement.css('top')
                }
            }
        });
    }

    close()
    {
        if (!this.hidden)
        {
            this.toggleHidden();
        }
    }


    render()
    {
        // let div = this.domElement;

        // if (this.modeSwitch)
        // {
        //     this.modeSwitch.update();
        // }

        // this.setErrorMessage(this.errorMessage);
    }

    makeModeSwitch()
    {
        let div = $('<div>')
            .addClass('ModeSwitch');


        let label = $('<div>')
            .addClass('Label')
            .text('Mode:');
        div.append(label);


        let updateButtons = (mode) => {
            Object.keys(this.modes).forEach(key => {
                let m = this.modes[key];
                if (key === mode)
                {
                    if (!m.hasClass('Active')) {
                        m.addClass('Active');
                    }
                }
                else
                {
                    if (m.hasClass('Active')) {
                        m.removeClass('Active');
                    }
                }
            });
        };

        let toggleMode = (mode) => {
            updateButtons(mode);
            window.events.emit('setShaderMode', { mode: mode });
        };

        function makeModeButton(modeName, text)
        {
            let mode = $('<div>')
            .addClass('Mode')
            .append($('<div>')
                .addClass('Content')
                .text(text));

            mode.addClass(modeName);

            mode.bind('click', ((toggleMode, modeName, event) =>
            {
                event.preventDefault();
                event.stopPropagation();
                toggleMode(modeName);
            }).bind(this, toggleMode, modeName));

            div.append(mode);

            return mode;
        }

        this.modes = {
            '2d': makeModeButton('2d', '2D'),
            'sphere': makeModeButton('sphere', '◯'),
            'cube': makeModeButton('cube', '☐'),
            'cylinder': makeModeButton('cylinder', '▯'),
            'cone': makeModeButton('cone', '△'),
        };

        this.modes['2d'].addClass('Active');

        div.update = (() =>
        {
            if (window.renderer.scene instanceof PreviewScene3D)
            {
                if (this.meshSettings)
                {
                    this.meshSettings.show();
                }
            }
            else
            {
                if (this.meshSettings)
                {
                    this.meshSettings.hide();
                }
            }
        }).bind(this);

        return div;
    }

    makeMeshSettings()
    {
        let div = $('<div>');
        div.addClass('meshSettings');

        let subdivision = $('<div>');
        {
            let label = $('<div>');
            {
                label.text('Subdivisions:');
            }
            subdivision.append(label);

            let input = $('<input type="range" min="1" max="256" value="64">');
            {
                input.addClass('slider');

                input.on('change input keyup', ((input, event) => {
                    updateMeshGeometry(input.val());
                }).bind(this, input));
            }
            subdivision.append(input);
        }
        div.append(subdivision);

        return div;
    }

    makeBuffersSettings()
    {
        let div = $('<div>');


        return div;
    }

    static formatErrorMessage(message, documentId, text)
    {
        text.addClass('errorMesageContent');
        let divs = message.split('\n')
        .filter(line => {
            if (line.startsWith('SPIRV-Cross'))
            {
                return true;
            }
            let re = /^(.*):(\d+):(\d+): (warning|error): (.*)/;

            let match = re.exec(line);
            if (match) {
                return true;
            }
            return false;
        })
        .map((line => {
            let div = $('<div>');
            div.addClass('errorMessageLine');

            let re = /^(.*):(\d+):(\d+): (warning|error): (.*)/;

            let match = re.exec(line);
            if (match) {
                div.addClass('mainMessage');
                let filename = match[1];
                let line = parseInt(match[2]);
                let column = parseInt(match[3]);
                let level = match[4];
                let message = match[5];

                const getBaseName = (filename) => {
                    let parts = filename ? filename.split(/(\\+|\/+)/) : [];
                    return parts[parts.length - 1];
                };

                let location = $('<div>').addClass('errorLocation');
                div.append(
                    location
                    .append($('<div>').addClass('filename').text(getBaseName(filename)))
                    .append($('<div>').addClass('line').text(line))
                    .append($('<div>').addClass('column').text(column))
                );

                location.on('click', ((event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    window.communicator.postMessage('goto', {
                        documentId: documentId,
                        filename: filename,
                        line: line,
                        column: column
                    });
                }));

                div.append($('<div>').addClass('level').addClass(level).text(level));
                div.append($('<div>').addClass('message').text(message));

            } else {
                div.text(line);
            }

            return div;
        }));

        if (divs.length === 0)
        {
            divs.push($('<div>').addClass('errorMessageLine').text(message));
        }
        divs.forEach(div => {
            text.append(div);
        });
    }


    blinkFrame(color)
    {
        let frame = $('<div>')
            .addClass('errorFrameAnimation')
            .css({
                'box-shadow': `inset 0px 0px 50px 50px ${color}`,
                position: 'fixed',
                top: -25,
                left: -25,
                right: -25,
                bottom: -25,
                width: 'auto',
                height: 'auto',
                margin: 0,
                padding: 0,
                'z-index': window.maxZIndex++
            });

        frame.hide();

        $('body').append(frame);

        const blink = (durationIn, durationOut) => {
            return new Promise((resolve) => {
                frame.fadeIn(durationIn, () => {
                    frame.fadeOut(durationOut, () => resolve());
                });
            });
        };

        const blinkSequence = (durationIn, durationOut, times) =>
        {
            if (times === 0) {
                return new Promise((resolve) => resolve());
            }
            let promise = undefined;
            for(let i = 0; i < times; ++i)
            {
                if (promise) {
                    promise = promise.then(() => blink(durationIn, durationOut));
                } else {
                    promise = blink(durationIn, durationOut);
                }
            }
            return promise;
        };

        blinkSequence(50, 250, 1);
        /*
        blinkSequence(50, 250, 1).then(() => {
            frame.css({ opacity: 0.5 });
            blinkSequence(50, 150, 1);
        });
        */
    }

    setErrorMessage(error, documentId, parent)
    {
        return;
        error = error || '';

        if (error && !this.errorMessage)
        {
            this.blinkFrame('rgba(255, 0, 0, 0.5)');
        }

        if (!error && this.errorMessage)
        {
            this.blinkFrame('rgba(0, 55, 255, 0.25)');
        }

        this.errorMessage = error;

        this.error.html('');

        let frame = $('#errorFrame');
        if (!error)
        {
            this.error.hide();

            if (!frame.hasClass('fixed'))
            {
                frame.addClass('fixed');
            }

            frame.fadeOut(250);
        }
        else
        {
            parent.append(this.formatErrorMessage(error, documentId));

            if (frame.hasClass('fixed'))
            {
                frame.removeClass('fixed');
            }
            frame.fadeIn(250);
        }
    }

    // makeErrorView() {
    //     return error;
    // }

    makeHideButton() {
        var button = $('<div id=hide>')
            .addClass('button');

        button.text('🛠');

        button.on('click', (event) => {
            this.toggleHidden();
            event.preventDefault();
            event.stopPropagation();
            return false;
        });

        return button;
    }

    toggleHidden(animationSpeed = 100)
    {
        let transitionOrigValue = this.domElement.css('transition');

        this.domElement.css('transition', '0s');

        if (this.hidden)
        {
            this.content.show(animationSpeed, () => {
                this.domElement.css('transition', transitionOrigValue);
            });

            if (this.domElement.hasClass('hidden'))  {
                this.domElement.removeClass('hidden');
            }

            this.domElement.unbind('click');
            this.button.hide(animationSpeed);
        }
        else
        {
            this.content.hide(animationSpeed, () => {
                this.domElement.css('transition', transitionOrigValue);
                this.domElement.bind('click', ((evnet) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.toggleHidden(animationSpeed);
                }).bind(this));
            });

            if (!this.domElement.hasClass('hidden'))  {
                this.domElement.addClass('hidden');
            }
            this.button.show(animationSpeed);
        }

        this.hidden = !this.hidden;

        this.postMessage('updateSettings', {
            settings: {
                hidden: this.hidden
            }
        });
    }

}
