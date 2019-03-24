'use strict';

import * as cp from 'child_process';
import * as vscode from 'vscode';

import ShaderDocument from './ShaderDocument';
import GLSLCode from './GLSLCode';
import ChildProcess from './ChildProcess';


export default class GLSLCompiler
{
    private defaultArgs: string[] = [ '--version', '2.0', '--es' ];
    // , '--vulkan-semantics', '--shader-model', '20'

    private executable: string = "SPIRV-Cross.exe";

    constructor()
    {
        this.loadConfiguration();
    }

    public loadConfiguration()
    {
        let section = vscode.workspace.getConfiguration('hlsl');

        if (section)
        {
            this.executable = section.get<string>('preview.spirv.executablePath', this.executable);
            this.defaultArgs = section.get<string[]>('preview.spirv.defaultArgs', this.defaultArgs);
        }
    }

    public async canUseNativeBinary(): Promise<boolean>
    {
        return new Promise<boolean>((resolve) =>
        {
            let options = vscode.workspace.rootPath ? { cwd: vscode.workspace.rootPath } : undefined;
            let childProcess = cp.spawn(this.executable, [ '--help' ], options);

            childProcess.on('error', (error: Error) =>
            {
                console.error(`SPIRV[${this.executable}] failed: ${error}`);
                resolve(false);
            });

            childProcess.on('exit', (code: number, signal: string) =>
            {
                if (code !== 0)
                {
                    console.error(`GLSLCompiler.canUseNativeBinary(): SPIRV[${this.executable}] exited with non-zero code: ${code}`);
                }
                resolve(code === 0);
            });
        });
    }

    public async Compile(filename: string, reflect: boolean = false): Promise<string>
    {
        let options = vscode.workspace.rootPath ? { cwd: vscode.workspace.rootPath } : undefined;

        let args: string[] = reflect ? [ '--reflect' ].concat(Array.from(this.defaultArgs)) : Array.from(this.defaultArgs);

        args.push(filename);

        // console.log(`Starting "${this.executable} ${args.join(' ')}"`);

        let process = await ChildProcess.Execute(this.executable, args, options);

        if (process.exitCode === 0)
        {
            return process.buffers.stdout;
        }
        else
        {
            throw new Error(process.buffers.stderr
                            ? process.buffers.stderr
                            : `existed with non-zero code: ${process.exitCode}`);
        }
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
