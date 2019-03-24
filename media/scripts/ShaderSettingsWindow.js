class BufferSettingsView extends AbstractView
{
    constructor(parent, buffer)
    {
        super(parent);

        this.buffer = buffer;

        this.realtime = undefined;

        this.opts = [
        ];

        this.resolution = {
            x: undefined,
            y: undefined
        };
    }

    needsRender()
    {
        if (!this.resolution.x) return true;
        if (!this.resolution.y) return true;
        if (!this.realtime) return true;
        if (this.buffer.matchRendererResolution)
        {
            if (parseInt(this.resolution.x.val()) !== window.renderer.width) return true;
            if (parseInt(this.resolution.y.val()) !== window.renderer.height) return true;
        }
        if (this.buffer.realtime !== this.realtime.is(':checked')) return true;
        if (!this.opts) return true;
        // if (this.opts[0].is(':checked') !== this.buffer.matchRendererResolution) return true;
        return false;
    }

    render()
    {
        if (!this.table)
        {
            this.table = $('<table>');
            this.table.addClass('ShaderSettingsTable');
            this.domElement.append(this.table);
        }

        if (!this.name)
        {
            const endEditing = ((label) => {
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
            }).bind(this, this.name);

            this.name = $(`<div>`)
                .addClass('Name')
                .css({
                    display: 'inline-block'
                })
                .text(this.buffer.name);

            this.table.append(
                $('<tr>')
                    .append($('<td>').text('Name'))
                    .append($('<td>').append(
                        $('<div>')
                        .append(this.name)
                        .append($('<div>')
                            .addClass('EditButton')
                            .css({
                                cursor: 'pointer',
                                display: 'inline',
                                'padding-left': '4px',
                                'color:': 'rgba(255, 255, 200, 1.0)'
                            })
                            .text('🖉')
                            .on('click', ((event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                this.name.change();
                            }).bind(this)))))
            );


            this.name.on('contextmenu change', ((label, event) =>
            {
                let origValue = label.text();

                const isValid = (name) => {
                    const re = /^[a-zA-Z_$][a-zA-Z_$0-9]*$/;
                    return re.test(name);
                };

                const endEditing = ((label) => {
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

                function selectText(node) {
                    // node = document.getElementById(node);

                    if (document.body.createTextRange) {
                        const range = document.body.createTextRange();
                        range.moveToElementText(node);
                        range.select();
                    } else if (window.getSelection) {
                        const selection = window.getSelection();
                        const range = document.createRange();
                        range.selectNodeContents(node);
                        selection.removeAllRanges();
                        selection.addRange(range);
                    } else {
                        console.warn("Could not select text in node: Unsupported browser.");
                    }
                }
                selectText(label[0]);
                // label.select();

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
                });
                label.focus();

            }).bind(this, this.name));
        }
        else
        {
            this.name.text(this.buffer.name);
        }

        if (!this.realtime)
        {
            this.table.append(
                $('<tr>')
                    .append($('<td>').text('Realtime'))
                    .append($('<td>').append(this.realtime =
                        $(`<input type="checkbox" ${this.buffer.realtime ? 'checked' : ''}>`)
                        .addClass('Realtime')
                        .on('change', ((event) => {
                            this.buffer.realtime = this.realtime.is(':checked');
                        }).bind(this))))
            );
        }
        else
        {
            this.realtime.prop('checked', this.buffer.realtime);
        }

        if (!this.filter)
        {
            this.table.append(
                $('<tr>')
                    .append($('<td>').text('Filter'))
                    .append($('<td>').append(this.filter =
                        $(`<input type="checkbox" ${this.buffer.linearFilter ? 'checked' : ''}>`)
                        .addClass('Filter')
                        .on('change', ((event) => {
                            this.buffer.linearFilter = this.filter.is(':checked');
                        }).bind(this))))
            );
        }
        else
        {
            this.filter.prop('checked', this.buffer.linearFilter);
        }

        if (!this.resolution.x || !this.resolution.y)
        {
            let randId = this.buffer.shader.documentId;
            let customResId = `customRes${randId}`;
            let matchScreenId = `matchScrreen${randId}`;
            let propertyId = `resolution${randId}`;
            let resOpt1;
            let resOpt2;
            this.table.append(
                $('<tr>')
                    .append($('<td>').text('Resolution'))
                    .append($('<td>').append(
                        $('<table>')
                        .append(
                            $('<tr>')
                            .append($('<td>').append(
                                resOpt1 = $(`<input type="radio">`)
                                    .attr('id', matchScreenId)
                                    .attr('name', propertyId)
                                    .addClass('ResolutionSelect')
                            ))
                            .append($('<td>').append(
                                $('<label>')
                                    .text('match output')
                                    .attr('for', matchScreenId)
                            ))
                        )
                        .append(
                            $('<tr>')
                            .append($('<td>').append(
                                resOpt2 = $(`<input type="radio">`)
                                    .attr('id', customResId)
                                    .attr('name', propertyId)
                                    .addClass('ResolutionSelect')
                            ))
                            .append($('<td>').append(
                                $(`<label>`)
                                    .attr('for', customResId)
                                    .addClass('ResolutionInput')
                                    .append(this.resolution.x = $('<input type="number">').addClass('ResolutionInputX'))
                                    .append(this.resolution.y = $('<input type="number">').addClass('ResolutionInputY'))
                            ))
                        ))
                    )
            );

            this.resolution.x.val(this.buffer.width);
            this.resolution.y.val(this.buffer.height);
            this.resolution.x.on('click', () =>
            {
                event.preventDefault();
                event.stopPropagation();
                resOpt2.prop('checked', true).change();
            });
            this.resolution.y.on('click', () =>
            {
                event.preventDefault();
                event.stopPropagation();
                resOpt2.prop('checked', true).change();
            });
            this.resolution.x.on('focus change input', () => resOpt2.prop('checked', true).change());
            this.resolution.y.on('focus change input', () => resOpt2.prop('checked', true).change());


            this.opts = [ resOpt1, resOpt2 ];

            if (this.buffer.matchRendererResolution)
            {
                resOpt1.prop('checked', true);
            }
            else
            {
                resOpt2.prop('checked', true);
            }

            const updateMatchRes = ((resOpt1, event)=>
            {
                if (this.buffer.matchRendererResolution = resOpt1.is(':checked'))
                {
                    this.resolution.x.val(window.renderer.width);
                    this.resolution.y.val(window.renderer.height);
                }
                else
                {
                    this.buffer.width = parseInt(this.resolution.x.val());
                    this.buffer.height = parseInt(this.resolution.y.val());
                }
            }).bind(this, resOpt1);


            updateMatchRes();

            resOpt1.on('change input keyup', updateMatchRes);
            resOpt2.on('change input keyup', updateMatchRes);

            this.resolution.x.on('change input keyup', ((event) => {
                this.buffer.width = parseInt(this.resolution.x.val());
            }).bind(this));
            this.resolution.y.on('change input keyup', ((event) =>
                this.buffer.height = parseInt(this.resolution.y.val())
            ).bind(this));
        }
        else
        {
            if (this.buffer.matchRendererResolution)
            {
                this.opts[0].prop('checked', true);
            }
            else
            {
                this.opts[1].prop('checked', true);
            }

            this.resolution.x.val(this.buffer.width);
            this.resolution.y.val(this.buffer.height);
        }

        if (!this.type)
        {
            const types = {
                'Unsigned Byte': THREE.UnsignedByteType,
                'Byte': THREE.ByteType,
                'Short': THREE.ShortType,
                'Unsigned Short': THREE.UnsignedShortType,
                'Int': THREE.IntType,
                'Unsigned Int': THREE.UnsignedIntType,
                'Float': THREE.FloatType,
                'Half Float': THREE.HalfFloatType,
                'Unsigned Short 4444': THREE.UnsignedShort4444Type,
                'Unsigned Short 5551': THREE.UnsignedShort5551Type,
                'Unsigned Short 565': THREE.UnsignedShort565Type,
                'Unsigned Int 248': THREE.UnsignedInt248Type
            };

            this.type = $('<select>');

            Object.keys(types).forEach(typ => {
                this.type.append(
                    $(`<option value=${types[typ]}>`)
                        .text(typ)
                        .prop('selected', this.buffer.type === types[typ])
                );
            });
            this.table.append(
                $('<tr>')
                    .append($('<td>').text('Type'))
                    .append($('<td>').append(this.type)));

            this.type.on('change input keyup', (event) => {
                this.buffer.type = parseInt(this.type.val());
            });
        }

        if (!this.format)
        {
            const formats = {
                'Alpha': THREE.AlphaFormat,
                'RGB': THREE.RGBFormat,
                'RGBA': THREE.RGBAFormat,
                'Luminance': THREE.LuminanceFormat,
                'Luminance Alpha': THREE.LuminanceAlphaFormat,
                'Depth': THREE.DepthFormat,
                'Depth Stencil': THREE.DepthStencilFormat
            };

            this.format = $('<select>');

            Object.keys(formats).forEach(fmt => {
                this.format.append(
                    $(`<option value=${formats[fmt]}>`)
                        .text(fmt)
                        .prop('selected', this.buffer.format === formats[fmt])
                );
            });
            this.table.append(
                $('<tr>')
                    .append($('<td>').text('Format'))
                    .append($('<td>').append(this.format)));

            this.format.on('change input keyup', (event) => {
                this.buffer.format = parseInt(this.format.val());
            });
        }
    }
}

class ShaderSettingsWindow extends HeaderWindow
{
    constructor(parent, buffer)
    {
        super(parent, buffer.name);

        this.buffer = buffer;

        this.domElement.addClass('ShaderSettingsWindow');
    }

    needsRender()
    {
        if (this.headerText.text() !== this.buffer.name) return true;
        return typeof(this.inputSettings) === 'undefined' ||
               typeof(this.bufferSettings) === 'undefined';
    }

    render()
    {
        this.headerText.text(this.buffer.name);

        if (!this.bufferSettings)
        {
            this.bufferSettings = new BufferSettingsView(this, this.buffer);
        }
        if (!this.inputSettings)
        {
            this.inputSettings = new ShaderSettingsView(this, this.buffer.shader);
        }
    }

}
