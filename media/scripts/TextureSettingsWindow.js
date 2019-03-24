

class TextureSettingsWindow extends HeaderWindow
{
    constructor(parent, texture)
    {
        super(parent, texture.name);

        this.texture = texture;

        this.domElement.addClass('textureSettings');

        this.table = this.createTextureSettingsTable();
        this.content.append(this.table);
    }

    onSettingsUpdate()
    {
        let settings = this.table.data('getSettings')();
        Object.assign(this.texture.settings, settings);
        this.texture.lastUpdateTime = Date.now();
        this.texture.needsUpdate = true;
    }

    createTextureSettingsTable()
    {
        let onUpdate = this.onSettingsUpdate.bind(this);
        let updateEvents = 'change input keyup';

        let table = $('<table>')
            .addClass('textureSettingsTable');

        function makeFilterCell(settings) {
            let cell = $('<td>');

            cell.addClass('textureSettingsFilterCell');

            let select = $('<select>')
                .append($(`<option value="nearest">`).text('Nearest'))
                .append($(`<option value="linear">`).text('Linear'));

            select.children().eq(settings.magFilter === THREE.NearestFilter ? 0 : 1).attr("selected", "selected");
            select.on(updateEvents, onUpdate);
            cell.append(select);

            cell.data('getSettings', (() => {
                const remapTable = {
                    nearest: THREE.NearestFilter,
                    linear: THREE.LinearFilter
                };
                let remap = (value) => {
                    return (value in remapTable) ? remapTable[value] : DefaultTextureSettings.magFilter;
                };
                let value = remap(select.children("option:selected").val());
                return {
                    minFilter: value,
                    magFilter: value
                };
            }));

            return cell;
        }

        function makeMipMapsCell(settings) {
            let cell = $('<td>');

            cell.addClass('textureSettingsMipMapsCell');

            let table = $('<table>');

            table.addClass('textureSettingsInnerTable');

            let row1 = $('<tr>');

            row1.append($('<td>').append($('<label>').text("Enabled")));

            let checkbox = $('<input type="checkbox">');
            checkbox.attr('checked', settings.generateMipmaps ? true : false);
            checkbox.on(updateEvents, onUpdate);
            row1.append($('<td>').append(checkbox));

            table.append(row1);

            let row2 = $('<tr>');

            row2.append($('<td>').append($('<label>').text("Min filter")));

            let minFilterSelect = $('<select>')
                .append($('<option value="nearest">').text('Nearest'))
                .append($('<option value="linear">').text('Linear'));
            minFilterSelect.children().eq(
                ((settings.minFilter === THREE.NearestFilter) ||
                (settings.minFilter === THREE.NearestMipMapNearestFilter) ||
                (settings.minFilter === THREE.NearestMipMapLinearFilter)) ? 0 : 1).attr("selected", "selected");
            minFilterSelect.on(updateEvents, onUpdate);
            row2.append($('<td>').append(minFilterSelect));

            table.append(row2);

            cell.append(table);

            cell.data('getSettings', ((magFilter) => {
                const remapTable = {};

                remapTable[THREE.NearestFilter] = {
                    nearest: THREE.NearestMipMapNearestFilter,
                    linear: THREE.NearestMipMapLinearFilter
                };

                remapTable[THREE.LinearFilter] = {
                    nearest: THREE.LinearMipMapNearestFilter,
                    linear: THREE.LinearMipMapLinearFilter
                };

                let remap = (magFilter, value) => {
                    if (!(magFilter in remapTable)) magFilter = THREE.LinearFilter;
                    let subtable = remapTable[magFilter];
                    if (!(value in subtable)) {
                        return subtable.linear;
                    }
                    return remapTable[magFilter][value];
                };
                let data = {
                    generateMipmaps: checkbox.is(":checked")
                };
                if (data.generateMipmaps) {
                    data['minFilter'] = remap(magFilter, minFilterSelect.children("option:selected").val());
                };

                return data;
            }));

            return cell;
        }

        function makeWrappingCell(settings) {
            let cell = $('<td>');

            cell.addClass('textureSettingsWrappingCell');

            let table = $('<table>');
            table.addClass('textureSettingsInnerTable');

            let row1 = $('<tr>');

            row1.append($('<td>').append($('<label>').text("Horizontal")));

            let selectH = $('<select>')
                .append($('<option value="clamp">').text('Clamp'))
                .append($('<option value="repeat">').text('Repeat'))
                .append($('<option value="mirror">').text('Mirror'));
            selectH.children().eq(
                ((settings.wrapS === THREE.MirroredRepeatWrapping) ? 2 : ((settings.wrapS === THREE.RepeatWrapping) ? 1 : 0))
            ).attr("selected", "selected");
            selectH.on(updateEvents, onUpdate);
            row1.append($('<td>').append(selectH));

            table.append(row1);

            let row2 = $('<tr>');
            row2.append($('<td>').append($('<label>').text("Vertical")));

            let selectV = $('<select>')
                .append($('<option value="clamp">').text('Clamp'))
                .append($('<option value="repeat">').text('Repeat'))
                .append($('<option value="mirror">').text('Mirror'));
            selectV.children().eq(
                ((settings.wrapT === THREE.MirroredRepeatWrapping) ? 2 : ((settings.wrapT === THREE.RepeatWrapping) ? 1 : 0))
            ).attr("selected", "selected");
            row2.append($('<td>').append(selectV));
            selectV.on(updateEvents, onUpdate);
            table.append(row2);

            cell.append(table);

            cell.data('getSettings', (() => {
                const remapTable = {
                    clamp: THREE.ClampToEdgeWrapping,
                    repeat: THREE.RepeatWrapping,
                    mirror: THREE.MirroredRepeatWrapping
                };
                let remap = (value) => {
                    return (value in remapTable) ? remapTable[value] : THREE.ClampToEdgeWrapping;
                };
                return {
                    wrapS: remap(selectH.children("option:selected").val()),
                    wrapT: remap(selectV.children("option:selected").val())
                };
            }));

            return cell;
        }

        let filterCell = makeFilterCell(this.texture.settings);
        table.append($('<tr>')
            .append($('<td>').text('Filter'))
            .append(filterCell)
        );
        table.data('filterCell', filterCell);

        let mipMapsCell = makeMipMapsCell(this.texture.settings);
        table.append($('<tr>')
            .append($('<td>').text('MipMaps'))
            .append(mipMapsCell)
        );
        table.data('mipMapsCell', mipMapsCell);

        let wrappingCell = makeWrappingCell(this.texture.settings);
        table.append($('<tr>')
            .append($('<td>').text('Wrapping'))
            .append(wrappingCell)
        );
        table.data('wrappingCell', wrappingCell);

        table.data('getSettings', ((table) => {

            let filterCell = table.data('filterCell');
            let mipMapsCell = table.data('mipMapsCell');
            let wrappingCell = table.data('wrappingCell');

            let filterSettings = filterCell.data('getSettings')();
            let mipMapsSettings = mipMapsCell.data('getSettings')(filterSettings.magFilter);

            let wrappingSettings = wrappingCell.data('getSettings')();

            let result = Object.assign({}, filterSettings, mipMapsSettings, wrappingSettings);

            return result;
        }).bind(this, table));

        return table;
    }


    show(x, y)
    {
        this.bringToTop();

        const animationOptions = {
            duration: 100,
            easing: 'linear'
        };

        if (this.domElement.is(':hidden'))
        {
            this.domElement.css({
                marginLeft: x - 20,
                marginTop: y - 15
            });

            this.domElement.fadeIn(animationOptions);

            this.onDidShow();
        }
        else
        {
            this.domElement.animate({
                marginLeft: x - 20,
                marginTop: y - 15
            }, animationOptions);
        }

    }
}
