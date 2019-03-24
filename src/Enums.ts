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
    vertex,
    buffer
}

export namespace ShaderType
{
    'use strict';

    export let strings = {
        pixel: 'pixel',
        vertex: 'vertex',
        buffer: 'buffer'
    };

    export let from = function (value: string): ShaderType
    {
        switch(value)
        {
            case 'vertex': return ShaderType.vertex;
            case 'buffer': return ShaderType.buffer;
        }

		return ShaderType.pixel;
    };

    export let GetShaderTypeName = function(type: ShaderType): string
    {
        switch(type)
        {
            case ShaderType.pixel: return 'pixel';
            case ShaderType.vertex: return 'vertex';
            case ShaderType.buffer: return 'buffer';
            default:
            {
                console.error('invalid shader type:', type);
            }
        }

        return 'pixel';
    };
}
