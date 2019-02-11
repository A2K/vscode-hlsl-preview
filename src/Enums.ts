'use strict';


export enum RunTrigger
{
    onSave,
    onType
}

export namespace RunTrigger
{
    'use strict';

    export let strings = {
        onSave: 'onSave',
        onType: 'onType'
    };

    export let from = function (value: string): RunTrigger
    {
        if (value === 'onSave')
        {
            return RunTrigger.onSave;
        }

		return RunTrigger.onType;
    };
}


export enum ShaderType
{
    pixel,
    vertex
}

export namespace ShaderType
{
    'use strict';

    export let strings = {
        pixel: 'pixel',
        vertex: 'vertex'
    };

    export let from = function (value: string): ShaderType
    {
        if (value === 'vertex')
        {
            return ShaderType.vertex;
        }

		return ShaderType.pixel;
    };
}
