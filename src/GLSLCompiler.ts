'use strict';

import * as cp from 'child_process';
import * as vscode from 'vscode';

import * as Constants from './Constants';
import ShaderDocument from './ShaderDocument';
import { ShaderType } from './Enums';


export class GLSLCode
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
        this.shaderDocument = shaderDocument;
        this.code = code;
        this.reflection = reflection;
        shaderDocument.reflection = reflection;
        shaderDocument.glslCode = this;

        if (shaderDocument.shaderType === ShaderType.vertex)
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
                            break;
                            default:
                                this.replaceInCode(input.name, 'position');
                        }
                    }
                }
            );

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

            this.code = this.code.replace(/\r/g, '');

            const re = /^(\s*gl_Position\s*=\s*param_var_[a-zA-Z0-9_]+\s*;\n)\s*gl_Position\.y\s*=\s*-\s*gl_Position\.y\s*;/m;
            this.code = this.code.replace(re, "$1");

            this.code = 'precision highp float;\n' + this.code;
        }

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

        // console.log('CODE:');
        // console.log(this.code);

        this.shaderDocument.code = this.code;
        // this.shaderDocument.uniforms = this.uniforms;

        // console.log('UNIFORMS:', this.uniforms);
    }

	public get uniforms(): { [key:string]: any }
	{
		let uniforms: { [key:string]: any } = {};

        if ('types' in this.reflection)
        {
            Object.keys(this.reflection['types']).forEach((key) =>
            {
                let structName:string = this.reflection['types'][key]['name'];

                structName = structName.replace(/^type_/, '');

                Object.keys(this.reflection['types'][key]['members']).forEach((memberKey) =>
                {
					let member:{[key:string]:any} = this.reflection['types'][key]['members'][memberKey];
					let name = member['name'];
					let type = member['type'];

                    if (structName === '_Globals' && (Constants.InternalParameters.indexOf(name) >= 0))
                    {
						return;
					}

                    if (!(structName in uniforms))
                    {
						uniforms[structName] = { };
                    }

					uniforms[structName][name] = type;
				});
			});
		}

		return uniforms;
    }

}

export default class GLSLCompiler
{
    private defaultArgs: string[] = [ '--version', '2.0', '--es' ];

    private executable: string = "SPIRV-Cross.exe";

    constructor()
    {
        let section = vscode.workspace.getConfiguration('hlsl');

        if (section)
        {
            this.executable = section.get<string>('preview.spirvcrossExecutablePath', this.executable);
            this.defaultArgs = section.get<string[]>('preview.spirvcrossDefaultArgs', this.defaultArgs);
        }
    }

    public Compile(filename: string, reflect: boolean = false): Promise<string>
    {
        return new Promise<string>((resolve, reject) =>
        {
            let options = vscode.workspace.rootPath ? { cwd: vscode.workspace.rootPath } : undefined;

            let args: string[] = reflect ? [ '--reflect' ].concat(Array.from(this.defaultArgs)) : Array.from(this.defaultArgs);

            args.push(filename);

            //console.log(`Starting "${this.executable} ${args.join(' ')}"`);

            let childProcess = cp.spawn(this.executable, args, options);

            childProcess.on('error', (error: Error) =>
            {
                console.error('childProcess error:', error);
                reject(error);
            });

            if (!childProcess.pid)
            {
                let errorMessage = "no child process pid (failed to create process)";
                console.error(errorMessage);
                reject(errorMessage);
                return;
            }

            var CompleteData: string = "";

            childProcess.stdout.on('data', (data: Buffer) =>
            {
                CompleteData += data.toString();
            });

            var err: string = "";
            childProcess.stderr.on('data', (data: Buffer) =>
            {
                err += data.toString();
            });

            childProcess.on('exit', (code) =>
            {
                if (code === 0)
                {
                    if (!reflect)
                    {
                        CompleteData = CompleteData.replace('gl_FragData[0]', 'gl_FragColor').replace(/^#version.*$/gm, '');
                    }
                    resolve(CompleteData);
                }
                else
                {
                    reject(err);
                }
            });
        });
    }

    public Process(shaderDocument: ShaderDocument, filename: string): Promise<GLSLCode>
    {
        return new Promise<GLSLCode>((resolve, reject) =>
        {
            this.Compile(filename, false)
            .then(
                (code: string) =>
                {
                    this.Compile(filename, true)
                    .then(
                        (reflectionData: string) =>
                        {
                            resolve(new GLSLCode(shaderDocument, code, JSON.parse(reflectionData)));
                        }
                    )
                    .catch(reason => reject(reason));
                }
            )
            .catch(reason => reject(reason));
        });
    }

}
