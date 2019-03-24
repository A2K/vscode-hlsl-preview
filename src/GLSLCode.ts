'use strict';

import * as Constants from './WebView/Constants';
import ShaderDocument from './ShaderDocument';
import { ShaderType } from './Enums';


export default class GLSLCode
{
    public shaderDocument: ShaderDocument;
    public code: string;
    public reflection: { [key:string]: any };

    private replaceInCode(target: string, replacement: string)
    {
        let position = 0;
        while((position = this.code.indexOf(target, position)) >= 0)
        {
            this.code.replace(target,
                (substring: string, ...args: any[]): string =>
                {
                    return substring;
                }
            );
            this.code = this.code.replace(target, replacement);

            position += replacement.length;
        }
    }

    constructor(shaderDocument: ShaderDocument, code: string, reflection: {[key:string]: any})
    {
        // console.log('reflection:', reflection);
        this.shaderDocument = shaderDocument;
        this.code = code.replace(/^#version.*$/gm, '');
        this.reflection = reflection;
        shaderDocument.reflection = reflection;
        shaderDocument.glslCode = this;

        if (shaderDocument.shaderType === ShaderType.vertex)
        {
            if (reflection)
            {
                if (reflection.types)
                {
                    Object.keys(reflection.types).forEach(key =>
                    {
                        if (reflection.types[key].name === "type__Globals")
                        {
                            let keysToRemove = new Set<string>();
                            Object.keys(reflection.types[key].members).forEach(memberKey =>
                            {
                                let uniform = reflection.types[key].members[memberKey];

                                if (!uniform)
                                {
                                    return;
                                }

                                if (uniform.name in Constants.VertexShaderReservedNames)
                                {
                                    keysToRemove.add(memberKey);
                                    this.replaceInCode(`_Globals.${uniform.name}`, uniform.name);
                                }

                                // remove field from Globals struct
                                const re = new RegExp(`(struct\\s+type_Globals\\s*{[^}]*)${Constants.VertexShaderReservedNames[uniform.name]}\\s+${uniform.name}\\s*;([^}]*})`, 'm');
                                this.code = this.code.replace(re, '$1$2');

                                // remove Globals struct if it is empty
                                const re2 = /struct\s+type_Globals\s*{\s*}\s*;\s*uniform\s+type_Globals\s+_Globals\s*;/m;
                                this.code = this.code.replace(re2, '');

                            });

                            keysToRemove.forEach(memberKey => {
                                delete reflection.types[key].members[memberKey];
                            });
                        }
                    });
                }

                if (reflection.inputs)
                {
                    reflection.inputs.forEach(
                        (input: { type: string, name: string, location: number }) =>
                        {
                            if (input.name.endsWith('TEXCOORD0'))
                            {
                                const re = /attribute\s+(?:highp|mediump|lowp)?vec2\s+in_var_TEXCOORD0\s*;/;
                                this.code = this.code.replace(re, '');
                                this.replaceInCode(input.name, 'uv');
                            }
                            else if (input.name.endsWith('POSITION0'))
                            {
                                const re = /attribute\s+(?:highp|mediump|lowp)?(float|vec\d)\s+in_var_POSITION0\s*;/;
                                let type = 'vec4';
                                this.code = this.code.replace(re, (substring:string, group1: string): string =>
                                {
                                    if (group1)
                                    {
                                        type = group1;
                                    }
                                    return '';
                                });

                                switch(type)
                                {
                                    case 'vec4':
                                        this.replaceInCode(input.name, 'vec4(position, 1.0)');
                                    break;
                                    case 'vec3':
                                        this.replaceInCode(input.name, 'position');
                                    break;
                                    case 'vec2':
                                        this.replaceInCode(input.name, 'position.xy');
                                    break;
                                    case 'float':
                                        this.replaceInCode(input.name, 'position.x');
                                    case 'float':
                                        this.replaceInCode(input.name, 'position.x');
                                    break;
                                    default:
                                        this.replaceInCode(input.name, 'position');
                                }
                            }
                        }
                    );
                }

                reflection.outputs.forEach(
                    (output: { type: string, name: string, location: number }) =>
                    {
                        if (output.name.endsWith('TEXCOORD0'))
                        {
                            const re = /varying\s+vec2\s+out_var_TEXCOORD0\s*;/;
                            this.code = this.code.replace(re, `varying highp vec2 ${output.name};`);
                        }
                    }
                );
            }

            this.code = this.code.replace(/\r/g, '');

            const re = /^(\s*gl_Position\s*=\s*param_var_[a-zA-Z0-9_]+\s*;\n)\s*gl_Position\.y\s*=\s*-\s*gl_Position\.y\s*;/m;
            this.code = this.code.replace(re, "$1");

            this.code.replace(/precision\s+(\w+)\s+(float|int)/, 'precision highp $2');

            if (!(/precision\s+(\w+)\s+float/.test(this.code)))
            {
                this.code = 'precision highp float;\n' + this.code;
            }
        }
        else
        {
            this.code = this.code.replace('gl_FragData[0]', 'gl_FragColor');
        }

        this.code = this.code.replace(/for\s*\(\s*;\s*;\s*\)/gm, 'for(int i = 0; i < 1; ++i)');

        let prefix = (shaderDocument.shaderType === ShaderType.vertex) ? 'out_var_' : 'in_var_';

        let objects = (shaderDocument.shaderType === ShaderType.vertex) ? reflection.outputs : reflection.inputs;

        if (objects)
        {
            objects.forEach(
                (input: { type: string, name: string, location: number }) =>
                {
                    if (input.name.startsWith(prefix))
                    {
                        let replacement = input.name.replace(prefix, 'var_');

                        this.replaceInCode(input.name, replacement);

                        input.name = replacement;
                    }
                }
            );
        }

        this.shaderDocument.code = this.code;
    }

	public get uniforms(): { [key:string]: any }
	{
		let uniforms: { [key:string]: any } = {};

        if (this.reflection.types)
        {
            Object.keys(this.reflection['types']).forEach((key) =>
            {
                let structName:string = this.reflection['types'][key]['name'];

                if (structName === 'type__Globals')
                {
                    Object.keys(this.reflection['types'][key]['members']).forEach((name: string) =>
                    {
                        let desc = this.reflection['types'][key]['members'][name];

                        (uniforms['_Globals'] || (uniforms['_Globals'] = {}))[desc.name] = {
                            type: desc.type
                        };
                });
                }

			});
		}

		return uniforms;
    }

}
